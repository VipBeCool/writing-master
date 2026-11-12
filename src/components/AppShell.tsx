import React from 'react';
import {
  Bookmark,
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  House,
  Lightbulb,
  Loader2,
  PenLine,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Mascot } from './Mascot';
import { ACCENT, type Accent } from './ui';
import { GRADE_GROUPS, type GradeLevel } from '../data/gradeProfiles';
import { getGradeProfile, useLibraryVersion } from '../services/libraryStore';
import { APP_VERSION } from '../services/updateService';

export type PageId = 'home' | 'idea' | 'write' | 'coach' | 'learn' | 'notebook';
export type LlmStatus = 'starting' | 'online' | 'offline';

export interface NavMeta {
  id: PageId;
  label: string;
  short: string;
  hint: string;
  icon: LucideIcon;
  accent: Accent;
  /** 写作四步里的序号；首页和笔记本没有 */
  step?: number;
}

/** 导航按“写作的学习流程”排列：想 → 写 → 改 → 学 */
export const NAV: NavMeta[] = [
  { id: 'home', label: '今天', short: '首页', hint: '看看今天做什么', icon: House, accent: 'brand' },
  { id: 'idea', label: '想一想', short: '想', hint: '说出你的想法', icon: Lightbulb, accent: 'sun', step: 1 },
  { id: 'write', label: '写一写', short: '写', hint: '动手写作文', icon: PenLine, accent: 'coral', step: 2 },
  { id: 'coach', label: '改一改', short: '改', hint: '批改与升格', icon: ClipboardCheck, accent: 'mint', step: 3 },
  { id: 'learn', label: '学一学', short: '学', hint: '看范文学技巧', icon: BookOpen, accent: 'sky', step: 4 },
  { id: 'notebook', label: '好词好句本', short: '收藏', hint: '好句与好文章', icon: Bookmark, accent: 'grape' },
];

interface AppShellProps {
  page: PageId;
  onNavigate: (p: PageId) => void;
  grade: GradeLevel;
  onGradeChange: (g: GradeLevel) => void;
  snippetCount: number;
  llmStatus: LlmStatus;
  onOpenParentZone: () => void;
  onOpenAbout?: () => void;
  children: React.ReactNode;
}

/* ───────────────────────────── 年级选择（原生下拉，按学段分组） ───────────────────────────── */

const GradeSelect: React.FC<{
  grade: GradeLevel;
  onChange: (g: GradeLevel) => void;
  className?: string;
  id: string;
}> = ({ grade, onChange, className = '', id }) => {
  useLibraryVersion();
  return (
    <div className="relative w-full">
      <select
        id={id}
        value={grade}
        onChange={(e) => onChange(e.target.value as GradeLevel)}
        className={`w-full cursor-pointer appearance-none rounded-2xl border-2 border-line bg-white pl-3.5 pr-9 py-2 text-base font-bold text-ink transition-colors hover:border-brand-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none ${className}`}
      >
        {GRADE_GROUPS.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.grades.map((id) => (
              <option key={id} value={id}>
                {getGradeProfile(id).name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 size-4.5 -translate-y-1/2 text-ink-mute"
        aria-hidden="true"
      />
    </div>
  );
};

/* ───────────────────────────── 模型状态 ───────────────────────────── */

export const ModelStatus: React.FC<{ status: LlmStatus; compact?: boolean }> = ({ status, compact }) => {
  const isStarting = status === 'starting';
  const isOnline = status === 'online';

  const text = isStarting ? 'AI 老师苏醒中…' : isOnline ? 'AI 老师在线' : 'AI 老师还没醒';
  const sub = isStarting ? '正在准备本地写作模型' : isOnline ? undefined : '请家长先启动模型服务';
  const shortText = isStarting ? '苏醒中' : isOnline ? '在线' : '未连接';

  return (
    <div
      role="status"
      title={text}
      className={`flex shrink-0 items-center gap-2.5 rounded-2xl ${compact ? 'px-1' : 'bg-canvas px-3 py-2.5'}`}
    >
      <span className="relative flex size-3 shrink-0 items-center justify-center">
        {isStarting && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
        )}
        <span
          aria-hidden="true"
          className={`size-3 shrink-0 rounded-full transition-colors duration-300 ${
            isStarting ? 'bg-amber-500' : isOnline ? 'bg-mint-500' : 'bg-coral-500'
          }`}
        />
      </span>
      {compact ? (
        <span className="text-sm leading-tight font-bold whitespace-nowrap text-ink">
          <span className="sr-only">{text}</span>
          {!isOnline && <span aria-hidden="true">{shortText}</span>}
        </span>
      ) : (
        <span className="min-w-0 text-sm leading-tight">
          <span className="flex items-center gap-1.5 font-bold text-ink">
            {text}
            {isStarting && <Loader2 className="size-3.5 animate-spin text-amber-600" />}
          </span>
          {sub && <span className="block text-xs text-ink-mute mt-0.5">{sub}</span>}
        </span>
      )}
    </div>
  );
};

/* ───────────────────────────── 侧边栏（≥1024px） ───────────────────────────── */

const SideNavItem: React.FC<{
  meta: NavMeta;
  active: boolean;
  onClick: () => void;
  badge?: number;
}> = ({ meta, active, onClick, badge }) => {
  const Icon = meta.icon;
  const a = ACCENT[meta.accent];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-brand-50 text-brand-900' : 'text-ink-soft hover:bg-canvas hover:text-ink'
      }`}
    >
      {/* 当前页指示条：形状 + 颜色双重提示 */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-2 -left-1 w-1.5 rounded-full transition-opacity ${a.bar} ${active ? 'opacity-100' : 'opacity-0'}`}
      />
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${a.tile}`}>
        <Icon className="size-5" aria-hidden="true" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-bold">
          {meta.step && <span className="text-xs font-extrabold text-ink-mute">{meta.step}</span>}
          {meta.label}
        </span>
        <span className="block truncate text-sm text-ink-mute">{meta.hint}</span>
      </span>
      {!!badge && (
        <span className="rounded-full bg-grape-100 px-2 py-0.5 text-sm font-bold text-grape-700">{badge}</span>
      )}
    </button>
  );
};

const Sidebar: React.FC<Omit<AppShellProps, 'children'>> = ({
  page,
  onNavigate,
  grade,
  onGradeChange,
  snippetCount,
  llmStatus,
  onOpenParentZone,
  onOpenAbout,
}) => {
  const flow = NAV.filter((n) => n.step);
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-line bg-white px-4 py-5 slim-scroll print:hidden lg:flex">
      {/* 品牌 */}
      <div className="flex items-center gap-3 px-1">
        <Mascot mood="hello" size={52} />
        <div>
          <p className="text-xl font-extrabold leading-tight tracking-tight text-ink">作文大师</p>
          <p className="text-sm text-ink-mute">你的 AI 写作导师</p>
        </div>
      </div>

      {/* 年级 */}
      <div className="space-y-1.5 px-1">
        <label htmlFor="grade-side" className="text-sm font-semibold text-ink-soft">
          我的年级
        </label>
        <GradeSelect id="grade-side" grade={grade} onChange={onGradeChange} />
      </div>

      {/* 导航 */}
      <nav aria-label="主菜单" className="flex flex-1 flex-col gap-1">
        <SideNavItem meta={NAV[0]} active={page === 'home'} onClick={() => onNavigate('home')} />

        <p className="mt-3 mb-1 px-3 text-sm font-bold text-ink-mute">写作四步</p>
        <div className="relative flex flex-col gap-1">
          {/* 把四步串起来的虚线 */}
          <span aria-hidden="true" className="absolute top-6 bottom-6 left-8 w-0.5 border-l-2 border-dashed border-line" />
          {flow.map((n) => (
            <SideNavItem key={n.id} meta={n} active={page === n.id} onClick={() => onNavigate(n.id)} />
          ))}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <SideNavItem
            meta={NAV[5]}
            active={page === 'notebook'}
            onClick={() => onNavigate('notebook')}
            badge={snippetCount}
          />
        </div>
      </nav>

      {/* 底部：模型状态 + 家长区 + 版本与检查更新 */}
      <div className="space-y-1.5 pt-1">
        <ModelStatus status={llmStatus} />
        <button
          type="button"
          onClick={onOpenParentZone}
          className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-base font-semibold text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
        >
          <ShieldCheck className="size-5" aria-hidden="true" />
          家长区
        </button>
        <button
          type="button"
          onClick={onOpenAbout || onOpenParentZone}
          className="group flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-xs font-semibold text-ink-mute transition-colors hover:bg-canvas hover:text-brand-700"
          title="点击查看关于与检查更新"
        >
          <span>作文大师 v{APP_VERSION}</span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100 text-[11px] font-bold text-brand-600">
            检查更新 →
          </span>
        </button>
      </div>
    </aside>
  );
};

/* ───────────────────────────── 窄屏：顶栏 + 底部 Tab ───────────────────────────── */

const TopBar: React.FC<Pick<AppShellProps, 'grade' | 'onGradeChange' | 'llmStatus' | 'onOpenParentZone'>> = ({
  grade,
  onGradeChange,
  llmStatus,
  onOpenParentZone,
}) => (
  <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/95 px-4 py-2 backdrop-blur print:hidden lg:hidden">
    <Mascot mood="hello" size={40} />
    <p className="shrink-0 text-lg font-extrabold tracking-tight whitespace-nowrap text-ink">作文大师</p>
    <div className="ml-auto flex items-center gap-2">
      <ModelStatus status={llmStatus} compact />
      <div className="w-28">
        <label htmlFor="grade-top" className="sr-only">
          我的年级
        </label>
        <GradeSelect id="grade-top" grade={grade} onChange={onGradeChange} className="py-1.5! text-sm!" />
      </div>
      <button
        type="button"
        onClick={onOpenParentZone}
        aria-label="家长区"
        className="grid size-10 place-items-center rounded-xl text-ink-soft hover:bg-canvas"
      >
        <ShieldCheck className="size-5" aria-hidden="true" />
      </button>
    </div>
  </header>
);

const BottomTabs: React.FC<Pick<AppShellProps, 'page' | 'onNavigate'>> = ({ page, onNavigate }) => (
  <nav
    aria-label="主菜单"
    className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur print:hidden lg:hidden"
  >
    <ul className="mx-auto flex max-w-xl">
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = page === n.id;
        return (
          <li key={n.id} className="flex-1">
            <button
              type="button"
              onClick={() => onNavigate(n.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex w-full flex-col items-center gap-0.5 px-1 pt-2 pb-1 text-xs font-bold transition-colors ${
                active ? 'text-brand-700' : 'text-ink-mute hover:text-ink'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-4 top-0 h-1 rounded-b-full ${ACCENT[n.accent].bar} ${active ? 'opacity-100' : 'opacity-0'}`}
              />
              <span className={`grid size-9 place-items-center rounded-xl ${active ? ACCENT[n.accent].tile : ''}`}>
                <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.5 : 2} />
              </span>
              {n.short}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);

/* ───────────────────────────── 外壳 ───────────────────────────── */

export const AppShell: React.FC<AppShellProps> = ({ children, ...props }) => (
  <div className="min-h-dvh lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
    >
      跳到主要内容
    </a>
    <Sidebar {...props} />
    <div className="flex min-w-0 flex-col">
      <TopBar
        grade={props.grade}
        onGradeChange={props.onGradeChange}
        llmStatus={props.llmStatus}
        onOpenParentZone={props.onOpenParentZone}
      />
      <main id="main" tabIndex={-1} className="flex-1 outline-none px-4 pt-6 pb-28 sm:px-8 lg:px-10 lg:pt-9 lg:pb-12 print:p-0">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
    <BottomTabs page={props.page} onNavigate={props.onNavigate} />
  </div>
);

