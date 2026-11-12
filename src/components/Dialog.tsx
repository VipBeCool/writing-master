import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** 内容区最大宽度，默认 40rem */
  maxWidth?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * 基于原生 <dialog> 的模态弹窗：
 * 自带焦点管理、Esc 关闭、背景惰性、关闭后焦点回到触发按钮；
 * 点击遮罩（轻点关闭）由这里补上。
 */
export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, description, maxWidth = '40rem', children, icon }) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // 点击遮罩区域（事件目标就是 dialog 本身）才关闭
        if (e.target === ref.current) onClose();
      }}
      className="m-auto"
    >
      {open && (
        <div
          className="flex max-h-[90dvh] w-[min(94vw,var(--dialog-w))] flex-col overflow-hidden rounded-3xl bg-white shadow-pop"
          style={{ ['--dialog-w' as string]: maxWidth }}
        >
          <header className="flex items-start gap-3 border-b border-line px-6 py-4">
            {icon}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-xl font-extrabold text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
            </div>
            <IconButton icon={X} label="关闭" onClick={onClose} className="-mr-2" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 slim-scroll">{children}</div>
        </div>
      )}
    </dialog>
  );
};

