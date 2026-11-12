import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Check, Info } from 'lucide-react';
import { Mascot, type MascotMood } from './Mascot';
import { cleanPastedText, normalizeDraftIndent, splitEssayParagraphs } from '../utils/text';

/* ───────────────────────────── 模块点缀色 ───────────────────────────── */

export type Accent = 'brand' | 'sun' | 'coral' | 'mint' | 'sky' | 'grape';

/** Tailwind 需要完整的类名字符串，所以这里把每个点缀色的用法都写全 */
export const ACCENT: Record<
  Accent,
  { tile: string; soft: string; text: string; ring: string; bar: string; dot: string }
> = {
  brand: {
    tile: 'bg-brand-100 text-brand-700',
    soft: 'bg-brand-50 border-brand-100 text-brand-800',
    text: 'text-brand-700',
    ring: 'ring-brand-200',
    bar: 'bg-brand-500',
    dot: 'bg-brand-500',
  },
  sun: {
    tile: 'bg-sun-100 text-sun-700',
    soft: 'bg-sun-50 border-sun-100 text-sun-700',
    text: 'text-sun-700',
    ring: 'ring-sun-200',
    bar: 'bg-sun-500',
    dot: 'bg-sun-500',
  },
  coral: {
    tile: 'bg-coral-100 text-coral-700',
    soft: 'bg-coral-50 border-coral-100 text-coral-700',
    text: 'text-coral-700',
    ring: 'ring-coral-200',
    bar: 'bg-coral-500',
    dot: 'bg-coral-500',
  },
  mint: {
    tile: 'bg-mint-100 text-mint-700',
    soft: 'bg-mint-50 border-mint-100 text-mint-700',
    text: 'text-mint-700',
    ring: 'ring-mint-200',
    bar: 'bg-mint-500',
    dot: 'bg-mint-500',
  },
  sky: {
    tile: 'bg-sky-100 text-sky-700',
    soft: 'bg-sky-50 border-sky-100 text-sky-700',
    text: 'text-sky-700',
    ring: 'ring-sky-200',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
  },
  grape: {
    tile: 'bg-grape-100 text-grape-700',
    soft: 'bg-grape-50 border-grape-100 text-grape-700',
    text: 'text-grape-700',
    ring: 'ring-grape-200',
    bar: 'bg-grape-500',
    dot: 'bg-grape-500',
  },
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ───────────────────────────── 卡片 / 页头 ───────────────────────────── */

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  tone?: 'plain' | Accent;
  as?: 'div' | 'section' | 'article';
}> = ({ children, className = '', tone = 'plain', as: Tag = 'div' }) => (
  <Tag
    className={cx(
      'rounded-3xl border p-5 sm:p-6',
      tone === 'plain' ? 'bg-surface border-line shadow-card' : ACCENT[tone].soft,
      className
    )}
  >
    {children}
  </Tag>
);

export const PageHeader: React.FC<{
  accent: Accent;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}> = ({ accent, icon: Icon, title, subtitle, action }) => (
  <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
    <div className={cx('grid size-14 shrink-0 place-items-center rounded-2xl', ACCENT[accent].tile)}>
      <Icon className="size-7" aria-hidden="true" strokeWidth={2.2} />
    </div>
    <div className="min-w-0 flex-1 basis-64">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
      <p className="mt-1 text-base text-ink-soft">{subtitle}</p>
    </div>
    {action}
  </header>
);

/** 表单里的“第 N 步”标题 */
export const StepHeading: React.FC<{ n: number; accent: Accent; children: React.ReactNode; right?: React.ReactNode }> = ({
  n,
  accent,
  children,
  right,
}) => (
  <div className="flex items-center justify-between gap-3">
    <h2 className="flex items-center gap-3 text-lg font-bold text-ink">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full text-base font-extrabold', ACCENT[accent].tile)}>
        {n}
      </span>
      {children}
    </h2>
    {right}
  </div>
);

/* ───────────────────────────── 按钮 ───────────────────────────── */

type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-bold transition-[transform,box-shadow,background-color] focus-visible:outline-3 focus-visible:outline-brand-400 focus-visible:outline-offset-2';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_3px_0_0_var(--color-brand-800)] hover:bg-brand-700 active:translate-y-[3px] active:shadow-none disabled:bg-line-strong disabled:text-ink-mute disabled:shadow-none disabled:active:translate-y-0',
  soft: 'border border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50',
  danger: 'border border-coral-100 bg-coral-50 text-coral-700 hover:bg-coral-100 disabled:opacity-50',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-6 py-3.5 text-lg',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** 加载中：显示转圈并禁用点击；按钮文字应同时改成“正在……” */
  loading?: boolean;
  block?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  block,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], block && 'w-full', className)}
    {...rest}
  >
    {loading ? <span className="spin-ring" aria-hidden="true" /> : Icon ? <Icon className="size-[1.15em]" aria-hidden="true" /> : null}
    {children}
  </button>
);

/** 纯图标按钮：必须提供 label（作为无障碍名称和悬浮提示） */
export const IconButton: React.FC<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: LucideIcon; label: string }
> = ({ icon: Icon, label, className = '', type = 'button', ...rest }) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cx(
      'relative grid size-10 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50',
      'after:absolute after:-inset-1 after:content-[""]',
      className
    )}
    {...rest}
  >
    <Icon className="size-5" aria-hidden="true" />
  </button>
);

/* ───────────────────────────── 表单 ───────────────────────────── */

export const INPUT_CLASS =
  'w-full rounded-2xl border-2 border-line bg-white px-4 py-3 text-base text-ink placeholder:text-ink-mute transition-colors hover:border-line-strong focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none focus-visible:outline-none';

export const Field: React.FC<{
  label: string;
  hint?: string;
  right?: React.ReactNode;
  children: (id: string) => React.ReactNode;
}> = ({ label, hint, right, children }) => {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-base font-semibold text-ink">
          {label}
        </label>
        {right}
      </div>
      {children(id)}
      {hint && <p className="text-sm text-ink-mute">{hint}</p>}
    </div>
  );
};

/** 分段选择（单选）：选中态=实心底色 + 勾，不只靠颜色区分 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  wrap = true,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly NoInfer<T>[] | readonly { value: NoInfer<T>; label: string }[];
  label: string;
  size?: 'sm' | 'md';
  wrap?: boolean;
}) {
  const items = (options as readonly (T | { value: T; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o as T, label: o as string } : o
  );
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex gap-2', wrap && 'flex-wrap')}>
      {items.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-xl border-2 font-semibold transition-colors',
              size === 'sm' ? 'px-3 py-1 text-sm' : 'px-4 py-2 text-base',
              selected
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line bg-white text-ink-soft hover:border-brand-200 hover:bg-brand-50'
            )}
          >
            {selected && <Check className="size-4" aria-hidden="true" strokeWidth={3} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 标签页（同一页面内切换视图）：选中态用下划线 + 加粗色，不靠颜色单独区分 */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: readonly { value: NoInfer<T>; label: string; icon?: LucideIcon; badge?: string }[];
  label: string;
}) {
  const baseId = useId();
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b-2 border-line slim-scroll">
      {tabs.map((t) => {
        const selected = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            id={`${baseId}-${t.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              const idx = tabs.findIndex((x) => x.value === value);
              if (e.key === 'ArrowRight') onChange(tabs[(idx + 1) % tabs.length].value);
              if (e.key === 'ArrowLeft') onChange(tabs[(idx - 1 + tabs.length) % tabs.length].value);
            }}
            className={cx(
              'relative -mb-0.5 inline-flex shrink-0 items-center gap-2 px-4 py-3 text-base font-semibold transition-colors',
              'after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:content-[""]',
              selected ? 'text-brand-700 after:bg-brand-600' : 'text-ink-soft hover:text-ink after:bg-transparent'
            )}
          >
            {Icon && <Icon className="size-4.5" aria-hidden="true" />}
            {t.label}
            {t.badge && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── 反馈：提示条 / 进度 / 空状态 ───────────────────────────── */

export const Banner: React.FC<{
  tone: 'error' | 'info' | 'success';
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ tone, title, children, action }) => {
  const style = {
    error: 'border-coral-200 bg-coral-50 text-coral-700',
    info: 'border-brand-100 bg-brand-50 text-brand-800',
    success: 'border-mint-200 bg-mint-50 text-mint-700',
  }[tone];
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-2xl border-2 p-4', style)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-base font-bold">{title}</p>
        {children && <div className="text-sm leading-relaxed text-ink-soft">{children}</div>}
      </div>
      {action}
    </div>
  );
};

/** 多步任务的进度条：已完成 ✓，进行中转圈，未开始空心 */
export const StepTracker: React.FC<{
  steps: string[];
  /** 当前进行中的步骤序号（0 开始）；等于 steps.length 表示全部完成；-1 表示尚未开始 */
  current: number;
  accent: Accent;
  label?: string;
}> = ({ steps, current, accent, label = '进度' }) => (
  <ol aria-label={label} className="flex items-center gap-2">
    {steps.map((s, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <li key={s} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
          <span
            className={cx(
              'grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold',
              done && 'bg-brand-600 text-white',
              active && cx('ring-4', ACCENT[accent].tile, ACCENT[accent].ring),
              !done && !active && 'bg-line text-ink-mute'
            )}
          >
            {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : active ? <span className="spin-ring size-3.5!" aria-hidden="true" /> : i + 1}
          </span>
          <span className={cx('text-sm font-semibold', done || active ? 'text-ink' : 'text-ink-mute')}>
            {s}
            <span className="sr-only">{done ? '（已完成）' : active ? '（进行中）' : '（未开始）'}</span>
          </span>
          {i < steps.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', done ? 'bg-brand-400' : 'bg-line')} aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);

export const ProgressBar: React.FC<{
  value: number;
  max: number;
  accent?: Accent;
  label: string;
  className?: string;
}> = ({ value, max, accent = 'brand', label, className = '' }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={Math.min(value, max)}
    className={cx('h-2.5 w-full overflow-hidden rounded-full bg-line', className)}
  >
    <div
      className={cx('h-full rounded-full transition-[width] duration-500', ACCENT[accent].bar)}
      style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
    />
  </div>
);

export const EmptyState: React.FC<{
  mood?: MascotMood;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ mood = 'hello', title, children, action }) => (
  <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-white/60 px-6 py-12 text-center">
    <Mascot mood={mood} size={104} bob />
    <h3 className="text-xl font-bold text-ink">{title}</h3>
    {children && <p className="max-w-sm text-base text-ink-soft">{children}</p>}
    {action}
  </div>
);

/** 小语说话：吉祥物 + 对话气泡，用于“夸夸你”“提示”等老师口吻的内容 */
export const SpeechBubble: React.FC<{
  mood?: MascotMood;
  title?: string;
  children: React.ReactNode;
  accent?: Accent;
}> = ({ mood = 'hello', title, children, accent = 'brand' }) => (
  <div className="flex items-start gap-3">
    <Mascot mood={mood} size={72} className="shrink-0" />
    <div className={cx('relative min-w-0 flex-1 rounded-3xl rounded-tl-lg border-2 p-4', ACCENT[accent].soft)}>
      {title && <p className="mb-1 text-sm font-extrabold">{title}</p>}
      <div className="text-base leading-relaxed text-ink">{children}</div>
    </div>
  </div>
);

export const Badge: React.FC<{ accent?: Accent; children: React.ReactNode; className?: string }> = ({
  accent = 'brand',
  children,
  className = '',
}) => (
  <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold', ACCENT[accent].tile, className)}>
    {children}
  </span>
);

/**
 * 字数统计小标签（客观展示与目标字数的差值，不用生硬的“达标”判断）：
 * - diff === 0: 刚好 x 字
 * - diff > 0: 超出 x 字
 * - diff < 0: 少 x 字
 */
export const CountChip: React.FC<{ count: number; target?: number }> = ({ count, target }) => {
  if (!target || count === 0) return <span className="text-sm font-semibold text-ink-soft">{count} 字</span>;
  const diff = count - target;
  let accent: Accent = 'mint';
  let text = '';

  if (diff === 0) {
    accent = 'mint';
    text = `刚好 ${target} 字`;
  } else if (diff > 0) {
    accent = diff <= 100 ? 'mint' : 'sun';
    text = `超出 ${diff} 字`;
  } else {
    // diff < 0 (少于目标字数)
    accent = diff >= -30 ? 'sun' : 'coral';
    text = `少 ${-diff} 字`;
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft">
      {count} 字
      <Badge accent={accent}>{text}</Badge>
    </span>
  );
};


/**
 * 多行输入框：粘贴时自动去掉空行和多余缩进。
 * 当 indentParagraphs 为 true（用于作文正文稿纸）时：
 * - 聚焦空稿纸自动首行空两格（　　），下笔即在第三格；
 * - 按 Enter 换行开启新自然段时，自动在新段开头补齐两个全角空格（　　）；
 * - 粘贴或失焦时自动规范所有自然段的首行两格缩进，且全程不干扰中文拼音输入法（IME）。
 */
export const PasteCleanTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { indentParagraphs?: boolean }
>(({ onPaste, onFocus, onBlur, onKeyDown, indentParagraphs = false, ...rest }, ref) => {
  const applyTextValue = (el: HTMLTextAreaElement, nextValue: string, cursorPos?: number) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(el, nextValue);
    if (typeof cursorPos === 'number') {
      el.setSelectionRange(cursorPos, cursorPos);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <textarea
      ref={ref}
      {...rest}
      onFocus={(e) => {
        onFocus?.(e);
        if (!indentParagraphs || e.defaultPrevented) return;
        const el = e.currentTarget;
        if (!el.value) {
          applyTextValue(el, '\u3000\u3000', 2);
        } else if (!el.value.startsWith('\u3000\u3000')) {
          const normalized = normalizeDraftIndent(el.value);
          if (normalized && normalized !== el.value) {
            applyTextValue(el, normalized, normalized.length);
          }
        }
      }}
      onBlur={(e) => {
        onBlur?.(e);
        if (!indentParagraphs || e.defaultPrevented) return;
        const el = e.currentTarget;
        if (!el.value.replace(/[\s\u3000]/g, '')) {
          if (el.value !== '') applyTextValue(el, '', 0);
        } else {
          const normalized = normalizeDraftIndent(el.value);
          if (normalized !== el.value) applyTextValue(el, normalized);
        }
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!indentParagraphs || e.defaultPrevented) return;
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const insert = '\n\u3000\u3000';
          if (!document.execCommand('insertText', false, insert)) {
            const el = e.currentTarget;
            const { selectionStart: s, selectionEnd: t, value } = el;
            applyTextValue(el, value.slice(0, s) + insert + value.slice(t), s + insert.length);
          }
        }
      }}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        const raw = e.clipboardData.getData('text/plain');
        if (!raw) return;
        const cleaned = cleanPastedText(raw, indentParagraphs);
        if (cleaned === raw) return; // 本来就干净，走浏览器默认粘贴
        e.preventDefault();
        if (!document.execCommand('insertText', false, cleaned)) {
          const el = e.currentTarget;
          const { selectionStart: s, selectionEnd: t, value } = el;
          applyTextValue(el, value.slice(0, s) + cleaned + value.slice(t), s + cleaned.length);
        }
      }}
    />
  );
});
PasteCleanTextarea.displayName = 'PasteCleanTextarea';

/**
 * 作文阅读纸张组件：每个自然段自动首行空两格，像真实课本和稿纸一样排版，
 * 选中好句时不会误带多余空格，也兼容流式打字光标。
 */
export const EssayPaper: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    content: string;
    placeholder?: React.ReactNode;
    streaming?: boolean;
    /** 是否折叠限制最大高度（用于列表预览） */
    clamped?: boolean;
    /** 仅提供裸段落内容（外部已有容器样式） */
    bare?: boolean;
  }
> = ({ content, placeholder, streaming = false, clamped = false, bare = false, className = '', ...rest }) => {
  const paragraphs = splitEssayParagraphs(content);
  const body =
    paragraphs.length > 0 ? (
      <div className="space-y-3">
        {paragraphs.map((para, idx) => (
          <p key={idx} className="essay-paragraph">
            {para}
            {streaming && idx === paragraphs.length - 1 && <span className="caret" aria-hidden="true" />}
          </p>
        ))}
      </div>
    ) : (
      <>
        {placeholder}
        {streaming && <span className="caret" aria-hidden="true" />}
      </>
    );

  if (bare) {
    return (
      <div
        className={cx(
          'paper-reading relative text-lg text-ink',
          clamped && 'max-h-[11.25rem] overflow-hidden print:max-h-none',
          className
        )}
        {...rest}
      >
        {body}
        {clamped && paragraphs.length > 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#fffdf7] to-transparent print:hidden"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cx(
        'paper-reading min-h-40 rounded-2xl border border-[#ece4d2] bg-[#fffdf7] p-5 text-lg text-ink sm:p-6',
        className
      )}
      {...rest}
    >
      {body}
    </div>
  );
};
