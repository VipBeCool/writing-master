import React from 'react';
import { Download, ExternalLink, Sparkles } from 'lucide-react';
import { Dialog } from './Dialog';
import { Mascot } from './Mascot';
import { Button } from './ui';
import {
  getClientPlatform,
  openExternalUrl,
  type UpdateInfo,
} from '../services/updateService';

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({ open, onClose, updateInfo }) => {
  const platform = getClientPlatform();

  // 根据当前系统优选下载地址
  const primaryDownloadUrl =
    platform === 'mac'
      ? updateInfo.macDownloadUrl || updateInfo.htmlUrl
      : updateInfo.windowsDownloadUrl || updateInfo.htmlUrl;

  const primaryLabel =
    platform === 'mac'
      ? updateInfo.macDownloadUrl
        ? '下载 macOS 安装包 (.dmg)'
        : '前往下载更新'
      : updateInfo.windowsDownloadUrl
        ? '下载 Windows 安装包 (.exe)'
        : '前往下载更新';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="发现新版本！"
      description={`小语作文已发布新版本 v${updateInfo.latestVersion}`}
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
              {updateInfo.releaseName || '小语作文最新版本'}
            </h4>
            <p className="mt-0.5 text-xs text-ink-soft">
              建议升级以体验最新的作文指导能力与功能改进。
            </p>
          </div>
        </div>

        {/* 更新日志 */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-ink">更新内容</label>
          <div className="max-h-48 overflow-y-auto rounded-2xl border border-line bg-canvas p-3.5 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap font-sans">
            {updateInfo.releaseNotes || '包含系统体验优化与性能稳定性提升。'}
          </div>
        </div>

        {/* 操作按钮组 */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-line">
          <Button
            variant="ghost"
            icon={ExternalLink}
            onClick={() => openExternalUrl(updateInfo.htmlUrl)}
          >
            查看更新日志
          </Button>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose}>
              稍后再说
            </Button>
            <Button
              icon={Download}
              onClick={() => {
                openExternalUrl(primaryDownloadUrl);
                onClose();
              }}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
