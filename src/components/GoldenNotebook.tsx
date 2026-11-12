import React, { useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Plus,
  Printer,
  Quote,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { GoldenSnippet, SavedEssay, SavedEssayKind } from '../types';
import { formatEssayForCopy, inferSnippetTag, SNIPPET_TAGS } from '../utils/text';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  EssayPaper,
  Field,
  INPUT_CLASS,
  PageHeader,
  Segmented,
  Tabs,
  type Accent,
  PasteCleanTextarea,
} from './ui';
import { Dialog } from './Dialog';

interface GoldenNotebookProps {
  gradeName: string;
  snippets: GoldenSnippet[];
  onRemoveSnippet: (id: string) => void;
  onUpdateSnippetTag?: (id: string, tag: GoldenSnippet['tag']) => void;
  onAddSnippet: (text: string, source: string, tag: any, explanation: string) => void;
  savedEssays: SavedEssay[];
  onRemoveEssay: (id: string) => void;
  onSaveEssay: (essay: Omit<SavedEssay, 'id' | 'wordCount' | 'createdAt'>) => void;
}

const TAG_ACCENT: Record<GoldenSnippet['tag'], Accent> = {
  未分类: 'brand',
  外貌神态: 'coral',
  动作细节: 'sun',
  语言对话: 'brand',
  心理刻画: 'coral',
  景物描写: 'mint',
  修辞佳句: 'sky',
  开头结尾: 'sky',
  哲理升华: 'grape',
};

const KIND_ACCENT: Record<SavedEssayKind, Accent> = {
  范文: 'sky',
  示范成文: 'sun',
  升格作文: 'mint',
  修改稿: 'brand',
};

const TAGS: GoldenSnippet['tag'][] = [...SNIPPET_TAGS];
const ESSAY_KINDS: SavedEssayKind[] = ['范文', '示范成文', '升格作文', '修改稿'];

export const GoldenNotebook: React.FC<GoldenNotebookProps> = ({
  gradeName,
  snippets,
  onRemoveSnippet,
  onUpdateSnippetTag,
  onAddSnippet,
  savedEssays,
  onRemoveEssay,
  onSaveEssay,
}) => {
  const [tab, setTab] = useState<'snippets' | 'essays'>('snippets');
  const [filter, setFilter] = useState<string>('全部');
  const [essayFilter, setEssayFilter] = useState<string>('全部');
  const [expandedEssays, setExpandedEssays] = useState<Record<string, boolean>>({});

  // 手动记好句弹窗状态
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState<'自动识别' | GoldenSnippet['tag']>('自动识别');
  const [note, setNote] = useState('');

  // 手动记好文章弹窗状态
  const [addingEssay, setAddingEssay] = useState(false);
  const [essayTitle, setEssayTitle] = useState('');
  const [essayGenre, setEssayGenre] = useState('记叙文');
  const [essayKind, setEssayKind] = useState<SavedEssayKind>('范文');
  const [essayContent, setEssayContent] = useState('');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  const hasUncategorized = snippets.some((s) => s.tag === '未分类');
  const filterTags: GoldenSnippet['tag'][] = hasUncategorized ? [...TAGS, '未分类'] : TAGS;
  const shownSnippets = filter === '全部' ? snippets : snippets.filter((s) => s.tag === filter);
  const filterOptions = [
    { value: '全部', label: `全部 ${snippets.length}` },
    ...filterTags.map((t) => ({ value: t, label: `${t} ${snippets.filter((s) => s.tag === t).length}` })),
  ];

  const shownEssays =
    essayFilter === '全部' ? savedEssays : savedEssays.filter((e) => e.kind === essayFilter);
  const essayFilterOptions = [
    { value: '全部', label: `全部 ${savedEssays.length}` },
    ...ESSAY_KINDS.map((k) => ({
      value: k,
      label: `${k} ${savedEssays.filter((e) => e.kind === k).length}`,
    })),
  ];

  const copy = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  const askRemove = (id: string, removeFn: (targetId: string) => void) => {
    if (confirmId !== id) {
      setConfirmId(id);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmId(null), 3000);
      return;
    }
    removeFn(id);
    setConfirmId(null);
  };

  const submitSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const resolvedTag = tag === '自动识别' ? inferSnippetTag(text.trim(), undefined, note.trim()) : tag;
    onAddSnippet(text.trim(), source.trim() || '我的课外阅读', resolvedTag, note.trim() || '自己积累的好句');
    setText('');
    setSource('');
    setNote('');
    setAdding(false);
  };

  const submitEssay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayTitle.trim() || !essayContent.trim()) return;
    onSaveEssay({
      title: essayTitle.trim(),
      content: essayContent.trim(),
      genre: essayGenre.trim() || '记叙文',
      gradeName,
      kind: essayKind,
    });
    setEssayTitle('');
    setEssayContent('');
    setAddingEssay(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedEssays((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="print:hidden">
        <PageHeader
          accent="grape"
          icon={Bookmark}
          title="好词好句本"
          subtitle="把喜欢的好句子和优秀范文、升格佳作存下来，常常翻一翻，写作文时自然下笔有神。"
          action={
            <div className="flex flex-wrap gap-2">
              {tab === 'snippets' ? (
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  记一句
                </Button>
              ) : (
                <Button icon={Plus} onClick={() => setAddingEssay(true)}>
                  存一篇
                </Button>
              )}
              <Button
                variant="soft"
                icon={Printer}
                onClick={() => window.print()}
                disabled={tab === 'snippets' ? snippets.length === 0 : savedEssays.length === 0}
              >
                打印复习单
              </Button>
            </div>
          }
        />
      </div>

      {/* 打印页眉 */}
      <div className="hidden border-b pb-3 text-center print:block">
        <h1 className="text-2xl font-black">
          {gradeName}语文 · {tab === 'snippets' ? '好词好句复习单' : '优秀范文与升格佳作集'}
        </h1>
        <p className="mt-1 text-sm">
          共 {tab === 'snippets' ? `${snippets.length} 句` : `${savedEssays.length} 篇`} · 打印日期{' '}
          {new Date().toLocaleDateString('zh-CN')}
        </p>
      </div>

      <div className="print:hidden">
        <Tabs
          label="收藏分类"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'snippets', label: '好句子', icon: Quote, badge: String(snippets.length) },
            { value: 'essays', label: '好文章', icon: FileText, badge: String(savedEssays.length) },
          ]}
        />
      </div>

      {/* ────────────────────── 好句子视图 ────────────────────── */}
      {tab === 'snippets' && (
        <>
          <div className="print:hidden">
            <Segmented value={filter} onChange={setFilter} options={filterOptions} label="按句子类型筛选" size="sm" />
          </div>

          {shownSnippets.length === 0 ? (
            <EmptyState
              mood="sorry"
              title={snippets.length === 0 ? '好句子本还是空的' : '这个类型还没有句子'}
              action={
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  自己记一句
                </Button>
              }
            >
              在“想一想”“改一改”“学一学”里遇到好句子，点收藏就会存到这里。
            </EmptyState>
          ) : (
            <ul className="grid gap-5 md:grid-cols-2 print:grid-cols-1 print:gap-3">
              {shownSnippets.map((s) => (
                <li key={s.id} className="print:break-inside-avoid">
                  <Card as="article" className="flex h-full flex-col gap-4 print:shadow-none">
                    <div className="flex items-center justify-between gap-2">
                      {onUpdateSnippetTag ? (
                        <select
                          aria-label="修改句子分类"
                          value={s.tag}
                          onChange={(e) => onUpdateSnippetTag(s.id, e.target.value as GoldenSnippet['tag'])}
                          className="cursor-pointer rounded-full border border-line bg-canvas px-2.5 py-0.5 text-sm font-bold text-ink hover:border-brand-300"
                        >
                          {TAGS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          {s.tag === '未分类' && <option value="未分类">未分类</option>}
                        </select>
                      ) : (
                        <Badge accent={TAG_ACCENT[s.tag] ?? 'brand'}>{s.tag}</Badge>
                      )}
                      <span className="truncate text-sm text-ink-mute">{s.sourceTitle}</span>
                    </div>

                    <div className="relative">
                      <Quote
                        className="absolute -top-1 -left-1 size-7 text-grape-100 print:hidden"
                        aria-hidden="true"
                      />
                      <p className="paper-reading pl-7 text-lg font-medium text-ink">{s.text}</p>
                    </div>

                    {s.explanation && (
                      <p className="flex items-start gap-2 rounded-2xl bg-grape-50 p-3 text-sm leading-relaxed text-ink-soft">
                        <Sparkles className="mt-0.5 size-4 shrink-0 text-grape-700" aria-hidden="true" />
                        {s.explanation}
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between border-t border-line pt-3 print:hidden">
                      <span className="text-sm text-ink-mute">{s.createdAt}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={copiedId === s.id ? Check : Copy}
                          onClick={() => copy(s.id, s.text)}
                        >
                          {copiedId === s.id ? '已复制' : '复制'}
                        </Button>
                        <Button
                          variant={confirmId === s.id ? 'danger' : 'ghost'}
                          size="sm"
                          icon={Trash2}
                          onClick={() => askRemove(s.id, onRemoveSnippet)}
                          aria-label={confirmId === s.id ? '确认删除这一句' : '删除这一句'}
                        >
                          {confirmId === s.id ? '确认删除' : '删除'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* ────────────────────── 好文章视图 ────────────────────── */}
      {tab === 'essays' && (
        <>
          <div className="print:hidden">
            <Segmented
              value={essayFilter}
              onChange={setEssayFilter}
              options={essayFilterOptions}
              label="按文章来源筛选"
              size="sm"
            />
          </div>

          {shownEssays.length === 0 ? (
            <EmptyState
              mood="hello"
              title={savedEssays.length === 0 ? '还没有收藏过整篇文章' : '这个分类下还没有文章'}
              action={
                <Button icon={Plus} onClick={() => setAddingEssay(true)}>
                  手动存一篇好文
                </Button>
              }
            >
              在“想一想”的示范成文、“改一改”的升格全文、“学一学”的范文与修改稿右上角，点“收藏”就能把整篇佳作存到这里。
            </EmptyState>
          ) : (
            <ul className="space-y-5 print:space-y-4">
              {shownEssays.map((item) => {
                const isLong = item.content.length > 220;
                const expanded = Boolean(expandedEssays[item.id]) || !isLong;
                return (
                  <li key={item.id} className="print:break-inside-avoid">
                    <Card as="article" className="space-y-4 print:shadow-none">
                      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge accent={KIND_ACCENT[item.kind] ?? 'brand'}>{item.kind}</Badge>
                            <span className="rounded-lg bg-canvas px-2.5 py-0.5 text-xs font-bold text-ink-soft">
                              {item.gradeName} · {item.genre}
                            </span>
                            <span className="text-xs font-semibold text-ink-mute">{item.wordCount} 字</span>
                          </div>
                          <h2 className="text-xl font-extrabold text-ink">《{item.title}》</h2>
                        </div>
                        <span className="text-sm text-ink-mute">{item.createdAt}</span>
                      </header>

                      <div className="rounded-2xl border border-[#ece4d2] bg-[#fffdf7] p-5">
                        <EssayPaper bare content={item.content} clamped={!expanded} />
                      </div>

                      <footer className="flex flex-wrap items-center justify-between gap-2 pt-1 print:hidden">
                        <div>
                          {isLong && (
                            <Button
                              variant="soft"
                              size="sm"
                              icon={expanded ? ChevronUp : ChevronDown}
                              onClick={() => toggleExpand(item.id)}
                            >
                              {expanded ? '收起正文' : `展开全文（${item.wordCount} 字）`}
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={copiedId === item.id ? Check : Copy}
                            onClick={() => copy(item.id, formatEssayForCopy(item.title, item.content))}
                          >
                            {copiedId === item.id ? '已复制全文' : '复制全文'}
                          </Button>
                          <Button
                            variant={confirmId === item.id ? 'danger' : 'ghost'}
                            size="sm"
                            icon={Trash2}
                            onClick={() => askRemove(item.id, onRemoveEssay)}
                            aria-label={confirmId === item.id ? '确认删除这篇文章' : '删除这篇文章'}
                          >
                            {confirmId === item.id ? '确认删除' : '删除'}
                          </Button>
                        </div>
                      </footer>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* 手动记一句好句子 */}
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="记一笔好句子"
        description="读书或课堂上遇到的好句子，也可以记在这里。"
        maxWidth="34rem"
      >
        <form onSubmit={submitSnippet} className="space-y-4">
          <Field label="句子">
            {(id) => (
              <PasteCleanTextarea
                id={id}
                rows={3}
                required
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="把想收藏的句子写在这里"
                className={`${INPUT_CLASS} resize-y`}
              />
            )}
          </Field>
          <Field label="出处（书名或文章）">
            {(id) => (
              <input
                id={id}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="例如：《城南旧事》"
                className={INPUT_CLASS}
              />
            )}
          </Field>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">句子类型</p>
            <Segmented
              value={tag}
              onChange={setTag}
              options={['自动识别', ...TAGS] as const}
              label="句子类型"
              size="sm"
            />
          </div>
          <Field label="好在哪里（可不填）">
            {(id) => (
              <input
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：把落叶比作蝴蝶，很生动"
                className={INPUT_CLASS}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!text.trim()}>
              保存到本子
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 手动存一篇好文章 */}
      <Dialog
        open={addingEssay}
        onClose={() => setAddingEssay(false)}
        title="存一篇好文章"
        description="把平时读到的好范文或自己改满意的作文存进本子，粘贴时会自动剔除多余空行。"
        maxWidth="40rem"
      >
        <form onSubmit={submitEssay} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="文章题目">
              {(id) => (
                <input
                  id={id}
                  required
                  autoFocus
                  value={essayTitle}
                  onChange={(e) => setEssayTitle(e.target.value)}
                  placeholder="例如：外婆家的桂花雨"
                  className={`${INPUT_CLASS} font-bold`}
                />
              )}
            </Field>
            <Field label="体裁">
              {(id) => (
                <input
                  id={id}
                  value={essayGenre}
                  onChange={(e) => setEssayGenre(e.target.value)}
                  placeholder="例如：记事 / 写人 / 议论文"
                  className={INPUT_CLASS}
                />
              )}
            </Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">归类</p>
            <Segmented value={essayKind} onChange={setEssayKind} options={ESSAY_KINDS} label="文章分类" size="sm" />
          </div>
          <Field label="文章正文">
            {(id) => (
              <PasteCleanTextarea
                id={id}
                rows={8}
                required
                value={essayContent}
                onChange={(e) => setEssayContent(e.target.value)}
                placeholder="粘贴或输入整篇文章内容…"
                className={`${INPUT_CLASS} resize-y leading-relaxed`}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAddingEssay(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!essayTitle.trim() || !essayContent.trim()}>
              保存到本子
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
