import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Columns2,
  MessageCircle,
  Minimize2,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { GoldenSnippet, SavedEssay } from '../types';
import { resolveGenre, type GradeProfile, type Stage } from '../data/gradeProfiles';
import { generateSampleEssay, reviseEssay, countChars } from '../services/aiService';
import { AudioInputButton } from './AudioInputButton';
import { PhotoUploader } from './PhotoUploader';
import { Mascot } from './Mascot';
import { formatEssayForCopy, inferGenreFromTitle, inferSnippetTag, SNIPPET_TAGS } from '../utils/text';
import {
  Badge,
  Banner,
  Button,
  Card,
  CountChip,
  EmptyState,
  EssayPaper,
  Field,
  INPUT_CLASS,
  IconButton,
  PageHeader,
  Segmented,
  StepHeading,
  PasteCleanTextarea,
} from './ui';

interface SampleStudioProps {
  profile: GradeProfile;
  onAddGoldenSnippet: (text: string, title: string, tag: any, explanation: string) => void;
  onSaveEssay: (essay: Omit<SavedEssay, 'id' | 'wordCount' | 'createdAt'>) => void;
  isEssaySaved: (title: string, content: string) => boolean;
}

type SelectableSnippetTag = '自动识别' | GoldenSnippet['tag'];
const TAG_OPTIONS: SelectableSnippetTag[] = ['自动识别', ...SNIPPET_TAGS];

/** 一键修改建议：不同学段给不同的提法 */
const QUICK_REQUESTS: Record<Stage, string[]> = {
  lower: ['把开头改得更吸引人', '加一句心里想的话', '多用一个比喻', '结尾写得更温暖'],
  upper: ['把开头改得更吸引人', '加一段心理描写', '多一些比喻拟人', '结尾更有感悟'],
  junior: ['开头更吸引人', '加强细节描写', '让立意更深刻', '语言更有文采'],
  senior: ['论据再新颖一些', '加强论证的逻辑', '让立意更有思辨性', '语言更凝练有力'],
};

const GREETING = '你好，我是小语！看看左边这篇范文，哪里想改就告诉我，比如“把第二段写得更生动”。';

type ChatDisplayMode = 'docked' | 'floating' | 'icon';

interface EssayVersion {
  title: string;
  content: string;
  label: string;
  request?: string;
}

export const SampleStudio: React.FC<SampleStudioProps> = ({
  profile,
  onAddGoldenSnippet,
  onSaveEssay,
  isEssaySaved,
}) => {
  const [title, setTitle] = useState('');
  const [genreRaw, setGenre] = useState('记事');
  const genre = resolveGenre(profile, genreRaw);
  const [wordCount, setWordCount] = useState(profile.defaultWordCount);
  const [requirements, setRequirements] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [essay, setEssay] = useState('');
  const [versions, setVersions] = useState<EssayVersion[]>([]);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tag, setTag] = useState<SelectableSnippetTag>('自动识别');
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: GREETING },
  ]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);

  // 生成范文后自动收起参数面板，把空间留给“范文 + 小语对话”并排展示
  const [paramsOpen, setParamsOpen] = useState(true);
  // 对话框显示形态：docked（右侧并排常驻）| floating（右下角悬浮窗）| icon（缩成右下角小语图标）
  const [chatMode, setChatMode] = useState<ChatDisplayMode>('docked');

  // 换年级后，字数滑块回到新年级的默认值
  useEffect(() => {
    setWordCount(profile.defaultWordCount);
  }, [profile.id, profile.defaultWordCount]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length, chatMode]);

  const sliderMin = Math.max(150, Math.round((profile.defaultWordCount - 150) / 50) * 50);
  const sliderMax = Math.round((profile.defaultWordCount + 250) / 50) * 50;
  const ctx = { profile, genre };
  const hasEssay = Boolean(essay.trim()) || busy;

  const generate = async () => {
    if (!title.trim()) {
      setParamsOpen(true);
      return setError('先给作文起个题目吧～');
    }
    setError(null);
    setBusy(true);
    setEssay('');
    setVersions([]);
    setActiveVersionIdx(0);
    setParamsOpen(false);
    try {
      const res = await generateSampleEssay({
        ...ctx,
        title: title.trim(),
        wordCount,
        requirements,
        onText: (t, body) => {
          if (t) setTitle(t);
          setEssay(body);
        },
      });
      if (res.body.trim()) {
        setVersions([{ title: res.title || title.trim(), content: res.body, label: '初稿' }]);
        setActiveVersionIdx(0);
      }
    } catch (e: any) {
      console.error('范文生成出错:', e);
      setError(e.message || '生成范文失败，请检查模型服务是否已启动');
      setParamsOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const send = async (text?: string) => {
    const request = (text ?? chatInput).trim();
    if (!request || revising || busy) return;
    setChatInput('');
    setChat((p) => [...p, { role: 'user', text: request }]);

    if (!essay.trim()) {
      setChat((p) => [...p, { role: 'assistant', text: '还没有范文可以修改哦，先点“生成范文”吧！' }]);
      return;
    }

    const previous = essay;
    const previousTitle = title;
    setRevising(true);
    try {
      const res = await reviseEssay({
        ...ctx,
        title,
        essay: previous,
        request,
        wordCount,
        onText: (t, body) => {
          if (t) setTitle(t);
          setEssay(body);
        },
      });
      const finalTitle = res.title || previousTitle;
      const finalBody = res.body;
      setVersions((prev) => {
        const base = prev.length > 0 ? prev : [{ title: previousTitle, content: previous, label: '初稿' }];
        const nextNum = base.length;
        const nextList = [
          ...base,
          {
            title: finalTitle,
            content: finalBody,
            label: `第 ${nextNum} 稿`,
            request,
          },
        ];
        setActiveVersionIdx(nextList.length - 1);
        return nextList;
      });
      setChat((p) => [
        ...p,
        {
          role: 'assistant',
          text: `好的，按“${request}”改好了！你可以在左边顶部随时切换查看不同版本对比，还想改哪里？`,
        },
      ]);
    } catch (e: any) {
      setEssay(previous); // 失败时恢复原文
      setTitle(previousTitle);
      setChat((p) => [...p, { role: 'assistant', text: `哎呀，这次没改成功：${e.message || '请稍后再试'}` }]);
    } finally {
      setRevising(false);
    }
  };

  const switchVersion = (idx: number) => {
    if (revising || busy) return;
    const target = versions[idx];
    if (!target) return;
    setActiveVersionIdx(idx);
    setTitle(target.title);
    setEssay(target.content);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(formatEssayForCopy(title, essay));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const collectSelection = () => {
    const selected = window.getSelection()?.toString().trim() || '';
    if (!selected) {
      setCollectMsg('先用鼠标在范文里选中一句喜欢的话，再点“收藏好句”哦。');
      return;
    }
    const finalTag = tag === '自动识别' ? inferSnippetTag(selected, essay) : tag;
    setCollectMsg(null);
    onAddGoldenSnippet(selected, `《${title}》`, finalTag, `我从范文里选的好句子（${profile.name}）`);
  };

  const isModifiedVersion = activeVersionIdx > 0;
  const saveFullEssay = () => {
    if (!essay.trim()) return;
    onSaveEssay({
      title: title.trim() || '未命名范文',
      content: essay,
      genre,
      gradeName: profile.name,
      kind: isModifiedVersion ? '修改稿' : '范文',
    });
  };

  const count = countChars(essay);
  const essayAlreadySaved = Boolean(essay.trim()) && isEssaySaved(title.trim() || '未命名范文', essay);
  const essayKindLabel = isModifiedVersion ? '修改稿' : '范文';
  const activeVersion = versions[activeVersionIdx];

  /* ── 聊天面板内部通用渲染（支持右侧并排 & 悬浮窗两种形态复用） ── */
  const renderChatContent = (inFloating: boolean) => (
    <div className="flex flex-col gap-3.5">
      <header className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Mascot mood={revising ? 'write' : 'hello'} size={38} className="shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-ink">和小语聊聊怎么改</h2>
            <p className="truncate text-xs text-ink-mute">
              {revising ? '小语正在按你的要求改写…' : '哪里想改直说，左边范文实时更新'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {inFloating && (
            <button
              type="button"
              onClick={() => setChatMode('docked')}
              title="固定到右侧并排显示"
              className="hidden items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink xl:inline-flex"
            >
              <Columns2 className="size-4" aria-hidden="true" />
              并排
            </button>
          )}
          <button
            type="button"
            onClick={() => setChatMode('icon')}
            title="缩成右下角小语图标"
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink-soft hover:bg-canvas hover:text-ink"
          >
            <Minimize2 className="size-4" aria-hidden="true" />
            缩成图标
          </button>
        </div>
      </header>

      <div
        className={`${
          inFloating ? 'max-h-64' : 'max-h-[22rem]'
        } space-y-3 overflow-y-auto pr-1 slim-scroll`}
        aria-live="polite"
      >
        {chat.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && <Mascot mood="hello" size={32} className="shrink-0" />}
            <p
              className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:text-base ${
                m.role === 'user'
                  ? 'rounded-br-md bg-brand-600 text-white'
                  : 'rounded-bl-md border border-sky-100 bg-sky-50 text-ink'
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        <div ref={chatEnd} />
      </div>

      {/* 快捷改法气泡 */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-ink-mute">点一下就能让小语改：</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REQUESTS[profile.stage].map((q) => (
            <button
              key={q}
              type="button"
              disabled={revising || busy || !essay}
              onClick={() => send(q)}
              className="rounded-full border-2 border-sky-100 bg-white px-3 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 disabled:opacity-50 sm:text-sm"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex items-center gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inFloating ? 'chat-input-float' : 'chat-input-dock'} className="sr-only">
          告诉小语你想怎么改
        </label>
        <input
          id={inFloating ? 'chat-input-float' : 'chat-input-dock'}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="例如：把第二段写得更生动"
          className={`${INPUT_CLASS} min-w-0 flex-1 py-2.5! text-sm! sm:text-base!`}
        />
        <AudioInputButton label="说" onTranscript={(t) => setChatInput((p) => p + t)} />
        <Button type="submit" size="sm" icon={Send} loading={revising} disabled={!chatInput.trim() || busy}>
          发送
        </Button>
      </form>
    </div>
  );

  /* ── 参数表单卡片 ── */
  const renderParamsForm = () => (
    <Card className="space-y-5">
      <StepHeading
        n={1}
        accent="sky"
        right={
          hasEssay ? (
            <Button variant="ghost" size="sm" icon={ChevronUp} onClick={() => setParamsOpen(false)}>
              收起参数
            </Button>
          ) : undefined
        }
      >
        想看什么范文
      </StepHeading>

      <div className={hasEssay ? 'grid gap-5 lg:grid-cols-2' : 'space-y-5'}>
        <div className="space-y-4">
          <Field label="作文题目">
            {(id) => (
              <input
                id={id}
                value={title}
                onChange={(e) => {
                  const next = e.target.value;
                  setTitle(next);
                  const inferred = inferGenreFromTitle(next, profile.genres);
                  if (inferred) setGenre(inferred);
                }}
                placeholder="例如：秋天的一场雨"
                className={`${INPUT_CLASS} font-bold`}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">体裁</p>
            <Segmented value={genre} onChange={setGenre} options={profile.genres} label="作文体裁" size="sm" />
          </div>

          <Field
            label={`目标字数：${wordCount} 字`}
            hint={`${profile.name}一般写 ${profile.defaultWordCount} 字左右`}
          >
            {(id) => (
              <input
                id={id}
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={50}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
            )}
          </Field>
        </div>

        <div className="space-y-4">
          <Field
            label="特别要求（可不填）"
            right={
              <AudioInputButton
                label="说出来"
                onTranscript={(t) => setRequirements((p) => (p ? `${p}，${t}` : t))}
              />
            }
          >
            {(id) => (
              <PasteCleanTextarea
                id={id}
                rows={3}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="例如：要写出雨声的变化，用上比喻，首尾呼应"
                className={`${INPUT_CLASS} resize-y leading-relaxed`}
              />
            )}
          </Field>

          <PhotoUploader
            imagePreview={photo}
            onImageSelected={setPhoto}
            label="拍下试卷上的作文要求"
            hint="可选；拍照识别功能开发中"
            note="识别功能即将上线"
          />
        </div>
      </div>

      {error && (
        <Banner tone="error" title="出了点小问题">
          {error}
        </Banner>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button size="lg" block={!hasEssay} icon={Sparkles} loading={busy} disabled={revising} onClick={generate}>
          {busy ? '老师正在写范文…' : hasEssay ? '按新参数重新生成' : '生成范文'}
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        accent="sky"
        icon={BookOpen}
        title="学一学"
        subtitle={`看一篇${profile.name}水平的范文，边看边和小语聊怎么改，好句子、好文章都能一键收藏。`}
      />

      {/* 还没有范文时：左边设参数，右边欢迎提示 */}
      {!hasEssay ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {renderParamsForm()}
          <EmptyState mood="hello" title="选个题目，看看范文吧">
            生成后，左边看范文、右边直接和小语对话改作文，不用来回上下翻页；满意的范文和修改稿还能整篇收藏。
          </EmptyState>
        </div>
      ) : (
        <>
          {/* 已生成范文后：顶部浓缩成一行参数条，随时可展开修改或重新生成 */}
          {paramsOpen ? (
            renderParamsForm()
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-3 py-3.5! sm:px-6!">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <Badge accent="sky">{genre}</Badge>
                <span className="truncate text-lg font-extrabold text-ink">《{title || '未命名'}》</span>
                <span className="text-sm text-ink-mute">· 目标 {wordCount} 字</span>
                {requirements.trim() && (
                  <span className="max-w-xs truncate rounded-lg bg-canvas px-2.5 py-1 text-xs text-ink-soft">
                    要求：{requirements.trim()}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={SlidersHorizontal}
                  onClick={() => setParamsOpen(true)}
                  disabled={busy || revising}
                >
                  改题目/要求
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  icon={RefreshCw}
                  loading={busy}
                  disabled={revising}
                  onClick={generate}
                >
                  重写一篇
                </Button>
              </div>
            </Card>
          )}

          {error && !paramsOpen && (
            <Banner tone="error" title="出了点小问题">
              {error}
            </Banner>
          )}

          {/* 主工作区：左侧范文阅读 + 右侧粘性对话面板（若用户把对话缩成图标或悬浮窗，范文自动舒展） */}
          <div
            className={
              chatMode === 'docked'
                ? 'grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'
                : 'space-y-6'
            }
          >
            {/* 左：范文卡片 */}
            <Card as="article" className="space-y-5">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge accent="sky">
                      {genre} · {activeVersion ? activeVersion.label : '范文'}
                    </Badge>
                    {revising && <Badge accent="sun">小语正在修改中…</Badge>}
                  </div>
                  <h2 className="mt-2 text-2xl font-extrabold text-ink">{title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CountChip count={count} target={wordCount} />
                  <Button
                    variant={essayAlreadySaved ? 'soft' : 'primary'}
                    size="sm"
                    icon={essayAlreadySaved ? CheckCircle2 : BookmarkPlus}
                    disabled={!essay.trim() || busy || revising || essayAlreadySaved}
                    onClick={saveFullEssay}
                  >
                    {essayAlreadySaved ? '已收藏全文' : `收藏这篇${essayKindLabel}`}
                  </Button>
                  <IconButton
                    icon={copied ? Check : Copy}
                    label={copied ? '已复制' : '复制全文'}
                    onClick={copy}
                    disabled={!essay}
                  />
                </div>
              </header>

              {/* 多版本随时切换栏（不落库，当前会话未重写前保留所有修改版本） */}
              {versions.length > 1 && (
                <div className="space-y-2 rounded-2xl bg-canvas px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="范文修改版本切换">
                    <span className="text-xs font-bold text-ink-mute">版本对比：</span>
                    {versions.map((v, idx) => {
                      const active = idx === activeVersionIdx;
                      const vCount = countChars(v.content);
                      return (
                        <button
                          key={idx}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          disabled={revising || busy}
                          onClick={() => switchVersion(idx)}
                          title={v.request ? `修改要求：${v.request}` : '最初生成的范文'}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1 text-xs font-bold transition-all ${
                            active
                              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                              : 'border-line bg-white text-ink-soft hover:border-brand-200 hover:text-ink'
                          }`}
                        >
                          <span>{v.label}</span>
                          <span className={active ? 'text-brand-100' : 'text-ink-mute'}>({vCount}字)</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeVersion?.request && (
                    <p className="text-xs text-ink-soft">
                      当前查看 <strong className="text-ink">{activeVersion.label}</strong> 的修改要求：“{activeVersion.request}”
                    </p>
                  )}
                </div>
              )}

              <EssayPaper
                content={essay}
                streaming={busy || revising}
                placeholder={<span className="text-ink-mute italic">老师正在提笔构思…</span>}
                className="min-h-56"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-50 p-4">
                <p className="flex items-center gap-2 text-base font-semibold text-sky-700">
                  <Sparkles className="size-5" aria-hidden="true" />
                  用鼠标选中喜欢的句子，点右边收藏好句；也可以把整篇{essayKindLabel}存进本子
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="collect-tag" className="sr-only">
                    句子类型
                  </label>
                  <select
                    id="collect-tag"
                    value={tag}
                    onChange={(e) => setTag(e.target.value as SelectableSnippetTag)}
                    className="rounded-xl border-2 border-sky-100 bg-white px-3 py-1.5 text-base font-semibold text-ink"
                  >
                    {TAG_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t === '自动识别' ? '✨ 自动识别分类' : t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // 点按钮时保留文字选区
                    onClick={collectSelection}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-base font-bold text-white hover:bg-brand-700"
                  >
                    <BookmarkPlus className="size-4.5" aria-hidden="true" />
                    收藏选中好句
                  </button>
                </div>
                {collectMsg && (
                  <p role="status" className="basis-full text-sm text-sky-700">
                    {collectMsg}
                  </p>
                )}
              </div>
            </Card>

            {/* 右：并排常驻模式下的对话卡片（桌面端 sticky 固定在视口内，无需上下滚动） */}
            {chatMode === 'docked' && (
              <Card as="section" className="xl:sticky xl:top-6">
                {renderChatContent(false)}
              </Card>
            )}
          </div>

          {/* 悬浮窗模式：右下角弹出聊天卡片 */}
          {chatMode === 'floating' && (
            <div
              role="dialog"
              aria-label="和小语聊聊怎么改"
              className="anim-fade-up fixed right-4 bottom-24 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-3xl border-2 border-brand-200 bg-white p-5 shadow-pop sm:right-6 lg:bottom-6"
            >
              {renderChatContent(true)}
            </div>
          )}

          {/* 缩成图标模式（或在非桌面端想要快速唤出小语时）：右下角小语悬浮球 */}
          {chatMode === 'icon' && (
            <button
              type="button"
              onClick={() => setChatMode('floating')}
              aria-label="展开和小语聊聊怎么改"
              className="anim-fade-up fixed right-4 bottom-24 z-40 flex items-center gap-2.5 rounded-full border-2 border-brand-200 bg-white py-2 pr-5 pl-2.5 text-base font-extrabold text-brand-800 shadow-pop transition-transform hover:scale-105 sm:right-6 lg:bottom-6"
            >
              <Mascot mood={revising ? 'write' : 'hello'} size={42} />
              <span className="flex flex-col items-start leading-tight">
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="size-4 text-brand-600" aria-hidden="true" />
                  和小语聊聊怎么改
                </span>
                <span className="text-xs font-medium text-ink-mute">
                  {revising ? '正在帮你改作文…' : `点我随时改作文（已聊 ${chat.length} 条）`}
                </span>
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
