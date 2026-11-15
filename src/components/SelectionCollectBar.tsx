import React, { useId, useState } from 'react';
import { BookmarkPlus, Sparkles } from 'lucide-react';
import type { GoldenSnippetTag } from '../types';
import { inferSnippetTag, SNIPPET_TAGS } from '../utils/text';

export type SelectableSnippetTag = '自动识别' | GoldenSnippetTag;

const TAG_OPTIONS: SelectableSnippetTag[] = ['自动识别', ...SNIPPET_TAGS];

const TONE: Record<'sky' | 'sun', { box: string; text: string; selectBorder: string }> = {
  sky: {
    box: 'bg-sky-50',
    text: 'text-sky-700',
    selectBorder: 'border-sky-100',
  },
  sun: {
    box: 'bg-sun-50',
    text: 'text-sun-700',
    selectBorder: 'border-sun-100',
  },
};

export interface SelectionCollectBarProps {
  /** 点击收藏且存在有效选区时触发，传出选中的文字与解析后的分类标签 */
  onCollect: (selectedText: string, resolvedTag: GoldenSnippetTag) => void;
  /** 文章正文，用于“自动识别分类”提取上下文 */
  essayContent: string;
  /** 限定选区来源容器（如包裹 EssayPaper 的节点）；不传则从全局选区读取 */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** 提示引导文案 */
  hint?: string;
  /** 未选中任何文本时显示的提示 */
  emptyHint?: string;
  /** 视觉色调 */
  accent?: 'sky' | 'sun';
  /** 是否禁用收藏操作 */
  disabled?: boolean;
}

function getSelectedTextInContainer(container?: HTMLElement | null): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const text = sel.toString().trim();
  if (!text) return '';
  if (!container) return text;
  // 校验选区起点落在目标作文容器内（用 anchorNode 兼容在末段三击时 focusNode 落到下一兄弟节点的情况）
  return sel.anchorNode && container.contains(sel.anchorNode) ? text : '';
}

/** 划词收藏好词好句工具条：供“学一学”“想一想”等阅读卡片复用 */
export const SelectionCollectBar: React.FC<SelectionCollectBarProps> = ({
  onCollect,
  essayContent,
  containerRef,
  hint = '用鼠标选中上面喜欢的句子，点右边直接收藏到好词好句本',
  emptyHint = '先用鼠标在上面的文章里选中一句喜欢的话，再点“收藏选中好句”哦。',
  accent = 'sky',
  disabled = false,
}) => {
  const selectId = useId();
  const [tag, setTag] = useState<SelectableSnippetTag>('自动识别');
  const [collectMsg, setCollectMsg] = useState<string | null>(null);
  const tone = TONE[accent];

  const handleCollect = () => {
    if (disabled) return;
    const selected = getSelectedTextInContainer(containerRef?.current);
    if (!selected) {
      setCollectMsg(emptyHint);
      return;
    }
    const resolvedTag = tag === '自动识别' ? inferSnippetTag(selected, essayContent) : tag;
    setCollectMsg(null);
    onCollect(selected, resolvedTag);
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${tone.box}`}>
      <p className={`flex items-center gap-2 text-base font-semibold ${tone.text}`}>
        <Sparkles className="size-5 shrink-0" aria-hidden="true" />
        <span>{hint}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          句子类型
        </label>
        <select
          id={selectId}
          value={tag}
          disabled={disabled}
          onChange={(e) => setTag(e.target.value as SelectableSnippetTag)}
          className={`rounded-xl border-2 bg-white px-3 py-1.5 text-base font-semibold text-ink disabled:opacity-50 ${tone.selectBorder}`}
        >
          {TAG_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === '自动识别' ? '✨ 自动识别分类' : t}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()} // 点按钮时保留文字选区
          onClick={handleCollect}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <BookmarkPlus className="size-4.5" aria-hidden="true" />
          收藏选中好句
        </button>
      </div>
      {collectMsg && (
        <p role="status" className={`basis-full text-sm ${tone.text}`}>
          {collectMsg}
        </p>
      )}
    </div>
  );
};
