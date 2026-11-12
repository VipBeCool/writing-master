import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { loadConfig } from '../services/configService';

interface AudioInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
}

export const AudioInputButton: React.FC<AudioInputButtonProps> = ({
  onTranscript,
  disabled,
  label = '说给小语听',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      window.location.protocol === 'tauri:' ||
      window.location.protocol === 'asset:');

  // 本地录音通过 MediaRecorder 发送给本地 ASR 服务
  const startLocalRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) {
          setIsListening(false);
          return;
        }

        setIsProcessing(true);
        setMessage('小语正在辨听你的想法…');

        const cfg = loadConfig();
        const asrUrl = cfg.asrApiUrl || 'http://localhost:8000/v1/audio/transcriptions';

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'audio.webm');
          formData.append('model', 'sensevoice-small');

          const response = await fetch(asrUrl, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const text = (data?.text || '').trim();
          if (text) {
            onTranscriptRef.current(text);
            setMessage(null);
          } else {
            setMessage('没听清，请靠麦克风近一点再试一次哦。');
          }
        } catch {
          setMessage('本地语音服务（8000端口）暂未连接，可直接打字输入。');
        } finally {
          setIsProcessing(false);
          setIsListening(false);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setMessage(null);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMessage('麦克风权限被拒绝，请在系统设置中允许小语作文使用麦克风。');
      } else {
        setMessage('启动麦克风失败，可以直接打字输入。');
      }
      setIsListening(false);
    }
  };

  const stopLocalRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // 浏览器原生 Web Speech API 兼容
  const toggleWebSpeech = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMessage('当前环境不支持语音识别，请直接打字。');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'zh-CN';

    rec.onresult = (event: any) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText) onTranscriptRef.current(finalText);
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMessage('语音服务不可用或麦克风未授权，可以直接打字。');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setMessage('语音识别暂时不可用，可以直接打字。');
      }
      setIsListening(false);
    };

    rec.onend = () => setIsListening(false);

    try {
      rec.start();
      setIsListening(true);
      setMessage(null);
    } catch {
      setIsListening(false);
    }
  };

  const toggle = () => {
    setMessage(null);
    if (isTauri || Boolean(navigator.mediaDevices?.getUserMedia)) {
      if (isListening) {
        stopLocalRecording();
      } else {
        startLocalRecording();
      }
    } else {
      toggleWebSpeech();
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || isProcessing}
        aria-pressed={isListening}
        className={`inline-flex items-center gap-2 rounded-2xl border-2 px-4 py-2 text-base font-bold transition-colors disabled:opacity-50 ${
          isListening
            ? 'border-coral-500 bg-coral-500 text-white animate-pulse'
            : isProcessing
            ? 'border-brand-300 bg-brand-50 text-brand-700'
            : 'border-sun-200 bg-sun-50 text-sun-700 hover:bg-sun-100'
        }`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="size-4 animate-spin text-current" />
            辨析想法中…
          </>
        ) : isListening ? (
          <>
            <Square className="size-4 fill-current" aria-hidden="true" />
            正在听…点一下说完了
          </>
        ) : (
          <>
            <Mic className="size-5" aria-hidden="true" />
            {label}
          </>
        )}
      </button>
      {message && (
        <span role="status" className="max-w-64 text-right text-sm text-coral-700">
          {message}
        </span>
      )}
    </span>
  );
};
