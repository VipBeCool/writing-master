import React, { useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Dialog } from './Dialog';
import { Mascot } from './Mascot';
import { Button } from './ui';
import {
  getClientPlatform,
  isTauriApp,
  openExternalUrl,
  performInAppUpdate,
  type UpdateInfo,
} from '../services/updateService';

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({ open, onClose, updateInfo }) => {
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const platform = getClientPlatform();
  const fallbackDownloadUrl =
    platform === 'mac'
      ? updateInfo.macDownloadUrl || updateInfo.htmlUrl
      : updateInfo.windowsDownloadUrl || updateInfo.htmlUrl;

  const handleStartUpdate = async () => {
    setUpdating(true);
    setError(null);
    setProgress(0);
    setStatusText('准备开始自动更新…');

    try {
      if (isTauriApp()) {
        await performInAppUpdate((pct, text) => {
          setProgress(pct);
          setStatusText(text);
        });
      } else {
        // 非原生客户端环境（浏览器内）回退到外部下载
        openExternalUrl(fallbackDownloadUrl);
        onClose();
      }
    } catch (err) {
      console.error('自动更新失败:', err);
      setError(err instanceof Error ? err.message : '自动更新未能完成');
      setUpdating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={updating ? () => {} : onClose}
      title="发现新版本！"
      description={`作文大师已发布新版本 v${updateInfo.latestVersion}`}
      maxWidth="38rem"
      icon={<Sparkles className="mt-0.5 size-6 text-brand-600" aria-hidden="true" />}
    >
      <div className="space-y-6">
        {/* 顶部插画与版本卡片 */}
        <div className="flex items-center gap-4 rounded-3xl bg-brand-50/60 p-4 border border-brand-100">
          <Mascot mood="cheer" size={68} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">
                v{updateInfo.latestVersion}
              </span>
              <span className="text-xs text-ink-mute">
                当前运行: v{updateInfo.currentVersion}
              </span>
              {updateInfo.publishedAt && (
                <span className="text-xs text-ink-mute">· {updateInfo.publishedAt}</span>
              )}
            </div>
            <h4 className="mt-1 font-bold text-ink text-base truncate">
              {updateInfo.releaseName || '作文大师最新版本'}
            </h4>
            <p className="mt-0.5 text-xs text-ink-soft">
              全新功能与模型能力已发布，点击即可原地自动完成更新与重启。
            </p>
          </div>
        </div>

        {/* 更新中进度条卡片 */}
        {updating && (
          <div className="rounded-2xl border-2 border-brand-300 bg-white p-4 space-y-3 anim-fade-up">
            <div className="flex items-center justify-between text-sm font-bold text-ink">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-brand-600" />
                {statusText || '正在自动更新中…'}
              </span>
              <span className="text-brand-700">{progress}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
            <p className="text-xs text-ink-mute">
              系统正在后台就地下载与替换程序，完成后将自动重启应用，无需手动操作。
            </p>
          </div>
        )}

        {/* 失败提示与手动回退 */}
        {error && (
          <div className="rounded-2xl border border-coral-200 bg-coral-50 p-3.5 text-xs text-coral-800 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 text-coral-600 mt-0.5" />
              <div>
                <p className="font-bold">自动更新遇到一点小问题</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => openExternalUrl(fallbackDownloadUrl)}>
                备用：打开下载页
              </Button>
              <Button size="sm" variant="soft" onClick={handleStartUpdate}>
                重试自动更新
              </Button>
            </div>
          </div>
        )}

        {/* 更新日志 */}
        {!updating && (
          <div className="space-y-2">
            <label className="text-sm font-bold text-ink">更新内容</label>
            <div className="max-h-44 overflow-y-auto rounded-2xl border border-line bg-canvas p-3.5 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap font-sans">
              {updateInfo.releaseNotes || '包含系统体验优化与性能稳定性提升。'}
            </div>
          </div>
        )}

        {/* 操作按钮组 */}
        {!updating && (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-line">
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => openExternalUrl(updateInfo.htmlUrl)}
            >
              更新详情
            </Button>

            <div className="flex items-center gap-2.5">
              <Button variant="ghost" onClick={onClose}>
                稍后再说
              </Button>
              <Button
                icon={RefreshCw}
                onClick={handleStartUpdate}
              >
                立即自动更新
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
