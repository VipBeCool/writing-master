import React, { useRef } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { Badge } from './ui';

interface PhotoUploaderProps {
  imagePreview: string | null;
  onImageSelected: (base64OrUrl: string | null) => void;
  label?: string;
  hint?: string;
  /** 额外的状态说明，如“文字识别功能开发中” */
  note?: string;
  accentClass?: string;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  imagePreview,
  onImageSelected,
  label = '拍照或上传照片',
  hint = '用电脑摄像头、手机或 iPad 拍下稿纸',
  note,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onImageSelected(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    onImageSelected(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment" // 在手机/iPad 上优先拉起后置摄像头
        onChange={handleFileChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {imagePreview ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-line bg-canvas">
          <img src={imagePreview} alt="已上传的照片" className="mx-auto max-h-64 w-full object-contain" />
          <button
            type="button"
            onClick={clearImage}
            aria-label="移除照片"
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          {note && (
            <div className="border-t border-line bg-white px-3 py-2 text-sm text-ink-soft">{note}</div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line-strong bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <Camera className="size-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-base font-bold text-ink">
              {label}
              {note && <Badge accent="sun">{note}</Badge>}
            </span>
            <span className="block text-sm text-ink-mute">{hint}</span>
          </span>
          <ImagePlus className="size-5 shrink-0 text-ink-mute group-hover:text-brand-700" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
