import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  Dices,
  History,
  Lightbulb,
  Lock,
  PenLine,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { IdeaTrainingSession, SavedEssay, TopicHistoryItem } from '../types';
import { defaultGenre, resolveGenre, type GradeProfile } from '../data/gradeProfiles';
import type { TopicCard } from '../data/topics';
import { getGenreGuide } from '../services/libraryStore';
import {
  coachIdea,
  writeIdeaDraft,
  pickGoldenSentences,
  countChars,
  drawBlindBoxTopic,
} from '../services/aiService';
import {
  addTopicHistory,
  clearTopicHistory,
  removeTopicHistory,
  useTopicHistory,
} from '../services/topicHistoryStore';
import { AudioInputButton } from './AudioInputButton';
import { Dialog } from './Dialog';
import { inferGenreFromTitle, inferSnippetTag } from '../utils/text';
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
  PageHeader,
  Segmented,
  SpeechBubble,
  StepHeading,
  StepTracker,
  PasteCleanTextarea,
} from './ui';

export interface IdeaNote {
  topic: string;
  genre: string;
  outline: string;
  questions: string[];
}

interface IdeaTrainerProps {
  profile: GradeProfile;
  /** 首页盲盒题带过来的题目；nonce 变化时重新应用 */
  preset: (TopicCard & { nonce: number }) | null;
  onAddGoldenSnippet: (text: string, title: string, tag: any, explanation: string) => void;
  onSaveEssay: (essay: Omit<SavedEssay, 'id' | 'wordCount' | 'createdAt'>) => void;
  isEssaySaved: (title: string, content: string) => boolean;
  onGoWrite: (note: IdeaNote) => void;
}

/** 把“【心理】：问题”拆成标签和正文（兼容流式输出未闭合括号） */
const splitQuestion = (q: string) => {
  const m = q.match(/^【(.+?)】[：:]?\s*([\s\S]*)$/);
  if (m) return { tag: m[1], text: m[2] };
  const partial = q.match(/^【([^】]*)$/);
  if (partial) return { tag: partial[1], text: '' };
  return { tag: '', text: q };
};

type Stage = 'idle' | 'coaching' | 'writing' | 'picking';

export const IdeaTrainer: React.FC<IdeaTrainerProps> = ({
  profile,
  preset,
  onAddGoldenSnippet,
  onSaveEssay,
  isEssaySaved,
  onGoWrite,
}) => {
  const [topic, setTopic] = useState(preset?.topic ?? '');
  const [topicTip, setTopicTip] = useState<string | null>(preset?.tip ?? null);
  const [topicModel, setTopicModel] = useState<string | null>(preset?.model ?? null);
  const [drawingTopic, setDrawingTopic] = useState(false);
  const [genreRaw, setGenre] = useState(preset?.genre ?? defaultGenre(profile));
  const genre = resolveGenre(profile, genreRaw);
  const [genreLocked, setGenreLocked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('全部');
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const confirmTimer = useRef<number | undefined>(undefined);

  const historyList = useTopicHistory();
  const [outline, setOutline] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [session, setSession] = useState<IdeaTrainingSession | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const isBusy = stage !== 'idle';

  // 首页点“就写这个”时，带入题目与破题提示，并自动记入历史
  useEffect(() => {
    if (preset) {
      setTopic(preset.topic);
      setGenre(preset.genre);
      setTopicTip(preset.tip || null);
      setTopicModel(preset.model || null);
      if (preset.topic) {
        addTopicHistory({
          topic: preset.topic,
          genre: preset.genre,
          tip: preset.tip || '',
          gradeName: profile.name,
          source: 'ai',
        });
      }
    }
  }, [preset?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const randomTopic = async () => {
    if (drawingTopic || isBusy) return;
    setDrawingTopic(true);
    setError(null);
    try {
      const { card } = await drawBlindBoxTopic({
        profile,
        genre: genreLocked ? genre : undefined,
        locked: genreLocked,
        currentTopic: topic.trim(),
      });
      setTopic(card.topic);
      if (!genreLocked) {
        setGenre(card.genre);
      }
      setTopicTip(card.tip);
      setTopicModel(card.model || null);
      // 记录到盲盒历史记录中
      addTopicHistory({
        topic: card.topic,
        genre: card.genre,
        tip: card.tip,
        gradeName: profile.name,
        source: 'ai',
      });
    } catch (err: any) {
      setError(err?.message || 'AI 出题失败，请检查模型服务是否已启动');
    } finally {
      setDrawingTopic(false);
    }
  };

  const pickFromHistory = (item: TopicHistoryItem) => {
    setTopic(item.topic);
    setGenre(item.genre);
    setTopicTip(item.tip);
    setHistoryOpen(false);
  };

  const handleClearHistory = () => {
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      window.clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirmClearHistory(false), 3000);
      return;
    }
    clearTopicHistory();
    setConfirmClearHistory(false);
  };

  const filteredHistory = useMemo(
    () => (historyFilter === '全部' ? historyList : historyList.filter((h) => h.genre === historyFilter)),
    [historyList, historyFilter]
  );

  const historyGenres = useMemo(() => {
    const set = new Set(historyList.map((h) => h.genre).filter(Boolean));
    return ['全部', ...Array.from(set)];
  }, [historyList]);

  const guide = getGenreGuide(genre);

  const start = async () => {
    if (!topic.trim()) return setError('先给作文定个题目吧，或者点“换个盲盒题”。');

    setError(null);
    setSession(null);
    setSaved({});
    setStage('coaching');
    const ctx = { profile, genre };
    const sessionId = `idea-${Date.now()}`;
    const createdAt = new Date().toLocaleString('zh-CN');
    const trimmedTopic = topic.trim();
    const outlineSummary = outline.trim() || '（由小导师自主构思）';

    const upsertCoaching = (
      feedback: IdeaTrainingSession['aiFeedback'],
      structure: IdeaTrainingSession['generatedDraft']['structure']
    ) => {
      setSession((prev) => ({
        id: prev?.id ?? sessionId,
        topic: trimmedTopic,
        topicCategory: genre,
        userOutlineVoiceText: outlineSummary,
        aiFeedback: feedback,
        generatedDraft: {
          title: prev?.generatedDraft.title || trimmedTopic,
          content: prev?.generatedDraft.content || '',
          wordCount: prev?.generatedDraft.wordCount || 0,
          structure,
          goldenSentences: prev?.generatedDraft.goldenSentences || [],
        },
        createdAt: prev?.createdAt ?? createdAt,
      }));
    };

    try {
      // 第 1 步：流式输出夸奖、追问和提分点拨，让用户在“听你说”阶段第一时间看到反馈
      const { feedback, structure } = await coachIdea({
        ...ctx,
        topic: trimmedTopic,
        outline,
        onProgress: ({ feedback: partialFeedback, structure: partialStructure }) => {
          if (
            partialFeedback.praise ||
            partialFeedback.scaffoldingQuestions.length > 0 ||
            partialFeedback.keyTips
          ) {
            upsertCoaching(partialFeedback, partialStructure);
          }
        },
      });
      upsertCoaching(feedback, structure);

      // 第 2 步：结合学生自己的想法，流式写示范成文
      setStage('writing');
      const draft = await writeIdeaDraft({
        ...ctx,
        topic: trimmedTopic,
        outline,
        questions: feedback.scaffoldingQuestions,
        onText: (title, body) =>
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  generatedDraft: {
                    ...prev.generatedDraft,
                    title: title || prev.generatedDraft.title,
                    content: body,
                    wordCount: countChars(body),
                  },
                }
              : prev
          ),
      });

      // 第 3 步：挑金句
      setStage('picking');
      const goldenSentences = await pickGoldenSentences({ ...ctx, essay: draft.body });
      setSession((prev) => (prev ? { ...prev, generatedDraft: { ...prev.generatedDraft, goldenSentences } } : prev));
    } catch (err: any) {
      console.error('想一想出错:', err);
      setError(err.message || '生成失败，请检查模型服务是否已启动');
    } finally {
      setStage('idle');
    }
  };

  const collect = (sentence: string) => {
    const inferredTag = inferSnippetTag(sentence, session?.generatedDraft.content);
    onAddGoldenSnippet(sentence, `《${session?.topic ?? topic}》`, inferredTag, `来自“想一想”的示范成文（${profile.name}）`);
    setSaved((p) => ({ ...p, [sentence]: true }));
  };

  const trackerCurrent =
    stage === 'coaching' ? 0 : stage === 'writing' ? 1 : stage === 'picking' ? 2 : session?.generatedDraft.content ? 3 : -1;
  const draft = session?.generatedDraft;
  const visibleQuestions = session?.aiFeedback.scaffoldingQuestions.filter((q) => q.trim().length > 0) ?? [];
  const showQuestionsCard = visibleQuestions.length > 0 || Boolean(session?.aiFeedback.keyTips);
  const showDraftCard = Boolean(draft) && (stage === 'writing' || stage === 'picking' || Boolean(draft?.content));

  return (
    <div className="space-y-6">
      <PageHeader
        accent="sun"
        icon={Lightbulb}
        title="想一想"
        subtitle="不用写长文，先把想法说出来，小导师帮你想到更多细节。"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 左：输入 */}
        <Card className="space-y-6 xl:sticky xl:top-6">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StepHeading n={1} accent="sun">
                选题目
              </StepHeading>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={History}
                  onClick={() => setHistoryOpen(true)}
                  disabled={isBusy}
                  title="查看所有抽过的盲盒题目历史"
                >
                  历史题目
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  icon={Dices}
                  loading={drawingTopic}
                  onClick={randomTopic}
                  disabled={isBusy}
                  title={genreLocked ? `当前已锁定「${genre}」，只抽取该体裁题目` : '体裁与题目随缘抽取'}
                >
                  {drawingTopic ? 'AI 出题中…' : genreLocked ? `换个盲盒题 (${genre})` : '换个盲盒题'}
                </Button>
              </div>
            </div>

            {/* 1. 先选体裁（移到上面），尽量排在单行内，右侧附带锁定图标按钮 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">作文体裁</span>
                <button
                  type="button"
                  onClick={() => setGenreLocked((prev) => !prev)}
                  className={`grid size-8 place-items-center rounded-xl border transition-all ${
                    genreLocked
                      ? 'border-sun-300 bg-sun-100 text-sun-800 shadow-sm'
                      : 'border-line bg-canvas text-ink-mute hover:border-sun-200 hover:text-ink'
                  }`}
                  title={
                    genreLocked
                      ? `当前已锁定「${genre}」（点击解锁：抽题时体裁随缘随机）`
                      : `点击锁定「${genre}」（抽题时仅限此体裁）`
                  }
                  aria-label={genreLocked ? `已锁定体裁${genre}` : '锁定当前体裁'}
                  aria-pressed={genreLocked}
                >
                  {genreLocked ? (
                    <Lock className="size-4 text-sun-700" aria-hidden="true" />
                  ) : (
                    <Unlock className="size-4 text-ink-mute" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div
                role="radiogroup"
                aria-label="作文体裁"
                className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto slim-scroll"
              >
                {profile.genres.map((g) => {
                  const selected = g === genre;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setGenre(g)}
                      className={`flex-1 shrink-0 px-2 py-1.5 text-center text-xs sm:text-sm font-bold rounded-xl border transition-all whitespace-nowrap ${
                        selected
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-line bg-canvas/70 text-ink-soft hover:border-brand-200 hover:bg-canvas'
                      }`}
                      title={g}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. 拟定题目输入框 */}
            <Field label="作文题目">
              {(id) => (
                <input
                  id={id}
                  value={topic}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTopic(next);
                    setTopicTip(null);
                    if (!genreLocked) {
                      const inferred = inferGenreFromTitle(next, profile.genres);
                      if (inferred) setGenre(inferred);
                    }
                  }}
                  placeholder="例如：那一刻，我真后悔"
                  className={`${INPUT_CLASS} font-bold`}
                />
              )}
            </Field>

            {/* 3. AI 盲盒破题小贴士 */}
            {topicTip && (
              <div className="flex items-start gap-2 rounded-2xl bg-sun-50 px-3.5 py-2.5 text-sm leading-relaxed text-ink-soft">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-sun-700" aria-hidden="true" />
                <div>
                  <span className="mr-1.5 inline-block rounded-md bg-sun-200 px-1.5 py-0.5 text-xs font-extrabold text-sun-700">
                    AI 盲盒题 · {genre}{topicModel ? ` · ${topicModel}` : ''}
                  </span>
                  <span>{topicTip}</span>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <StepHeading n={2} accent="sun" right={<AudioInputButton onTranscript={(t) => setOutline((p) => (p ? `${p}，${t}` : t))} />}>
              说说你的想法
            </StepHeading>
            <Field
              label="我的想法（选填）"
              hint={
                guide.questionDirections
                  ? `可参考方向：${guide.questionDirections}；没有思路也可直接留空让小导师构思`
                  : '可以随便说说，也可以留空让小导师直接自主构思'
              }
            >
              {(id) => (
                <PasteCleanTextarea
                  id={id}
                  rows={6}
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="点上面的话筒直接说，或者打字记录；如果暂时没思路也可以直接留空，小导师会自主为你构思示范！"
                  className={`${INPUT_CLASS} resize-y leading-relaxed`}
                />
              )}
            </Field>
          </section>

          {error && <Banner tone="error" title="还差一点点">{error}</Banner>}

          <div className="space-y-2.5">
            <Button size="lg" block icon={outline.trim() ? Send : Sparkles} loading={isBusy} onClick={start}>
              {stage === 'coaching'
                ? '小导师正在认真构思…'
                : stage === 'writing'
                ? '正在写示范成文…'
                : stage === 'picking'
                ? '正在挑选好句子…'
                : outline.trim()
                ? '请小导师点拨'
                : '让小导师直接生成'}
            </Button>

            <Button
              size="lg"
              variant="soft"
              block
              icon={PenLine}
              disabled={!topic.trim() || isBusy}
              onClick={() =>
                onGoWrite({
                  topic: topic.trim(),
                  genre,
                  outline: outline.trim(),
                  questions: session?.aiFeedback.scaffoldingQuestions || [],
                })
              }
            >
              我来写一写
            </Button>
          </div>
        </Card>

        {/* 右：结果 */}
        <div className="space-y-5">
          {!session && !isBusy && (
            <EmptyState mood="think" title="在左边说说你的想法吧">
              小导师会先夸夸你，再问你几个小问题，最后用你的想法写一篇示范作文。
            </EmptyState>
          )}

          {(session || isBusy) && (
            <Card>
              <StepTracker steps={['听你说', '写示范', '挑好句']} current={trackerCurrent} accent="sun" label="想一想的进度" />
            </Card>
          )}

          {stage === 'coaching' && !session && (
            <Card className="anim-fade-up flex items-center gap-3 text-base text-ink-soft">
              <span className="inline-block size-2.5 animate-pulse rounded-full bg-sun-500" aria-hidden="true" />
              小导师正在认真听你的想法，马上就好…
            </Card>
          )}

          {session && (
            <>
              <section className="anim-fade-up space-y-4">
                {session.aiFeedback.praise && (
                  <SpeechBubble mood="cheer" title="小导师夸夸你" accent="sun">
                    <div className="text-justify-zh">
                      {session.aiFeedback.praise}
                      {stage === 'coaching' && !showQuestionsCard && (
                        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-sun-600 align-text-bottom" aria-hidden="true" />
                      )}
                    </div>
                  </SpeechBubble>
                )}

                {showQuestionsCard && (
                  <Card className="space-y-4">
                    <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
                      <Lightbulb className="size-5 text-sun-700" aria-hidden="true" />
                      再想想这几个问题，作文会更生动
                    </h2>
                    {visibleQuestions.length > 0 && (
                      <ol className="space-y-3">
                        {visibleQuestions.map((q, i) => {
                          const { tag, text } = splitQuestion(q);
                          const isStreamingThis =
                            stage === 'coaching' && !session.aiFeedback.keyTips && i === visibleQuestions.length - 1;
                          return (
                            <li key={i} className="flex items-start gap-3 rounded-2xl bg-sun-50 p-4">
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun-200 text-base font-extrabold text-sun-700">
                                {i + 1}
                              </span>
                              <div className="min-w-0 space-y-1">
                                {tag && <Badge accent="sun">{tag}</Badge>}
                                {(text || isStreamingThis) && (
                                  <p className="text-justify-zh text-base leading-relaxed text-ink">
                                    {text}
                                    {isStreamingThis && (
                                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-sun-600 align-text-bottom" aria-hidden="true" />
                                    )}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {session.aiFeedback.keyTips && (
                      <p className="flex items-start gap-2 rounded-2xl bg-canvas px-4 py-3 text-base text-ink-soft">
                        <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                        <span className="text-justify-zh">
                          <strong className="text-ink">提分点拨：</strong>
                          {session.aiFeedback.keyTips}
                          {stage === 'coaching' && !draft?.structure.beginning && (
                            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-brand-600 align-text-bottom" aria-hidden="true" />
                          )}
                        </span>
                      </p>
                    )}
                  </Card>
                )}
              </section>

              {showDraftCard && draft && (
                <Card as="article" className="anim-fade-up space-y-5">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                    <div className="min-w-0">
                      <Badge accent="sun">根据你的想法写的示范</Badge>
                      <h2 className="mt-2 text-2xl font-extrabold text-ink">{draft.title}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CountChip count={draft.wordCount} target={profile.defaultWordCount} />
                      {!isBusy && draft.content && (
                        <Button
                          variant={isEssaySaved(draft.title, draft.content) ? 'soft' : 'primary'}
                          size="sm"
                          icon={isEssaySaved(draft.title, draft.content) ? CheckCircle2 : BookmarkPlus}
                          disabled={isEssaySaved(draft.title, draft.content)}
                          onClick={() =>
                            onSaveEssay({
                              title: draft.title,
                              content: draft.content,
                              genre: session.topicCategory || genre,
                              gradeName: profile.name,
                              kind: '示范成文',
                            })
                          }
                        >
                          {isEssaySaved(draft.title, draft.content) ? '已收藏全文' : '收藏这篇示范'}
                        </Button>
                      )}
                    </div>
                  </header>

                  <dl className="grid gap-2 sm:grid-cols-3">
                    {[
                      ['开头', draft.structure.beginning],
                      ['中间', draft.structure.body],
                      ['结尾', draft.structure.ending],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-2xl bg-canvas p-3">
                        <dt className="text-sm font-extrabold text-sun-700">{k}怎么写</dt>
                        <dd className="mt-1 text-sm leading-relaxed text-ink-soft">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <EssayPaper
                    content={draft.content}
                    streaming={stage === 'writing'}
                    placeholder={stage === 'writing' ? <span className="text-ink-mute italic">小导师正在根据你的想法提笔…</span> : null}
                  />

                  {(draft.goldenSentences.length > 0 || stage === 'picking') && (
                    <section className="space-y-3">
                      <h3 className="flex items-center gap-2 text-base font-extrabold text-ink">
                        <Sparkles className="size-5 text-sun-700" aria-hidden="true" />
                        点睛好句，收藏到好词好句本
                      </h3>
                      {stage === 'picking' && <p className="text-sm text-ink-mute">正在挑选…</p>}
                      <ul className="space-y-2">
                        {draft.goldenSentences.map((s) => {
                          const sTag = inferSnippetTag(s, draft.content);
                          return (
                            <li key={s} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sun-50 p-4">
                              <div className="min-w-0 flex-1 basis-60 space-y-1">
                                <Badge accent="sun">{sTag}</Badge>
                                <p className="paper-reading text-base text-ink">“{s}”</p>
                              </div>
                              <Button
                                variant={saved[s] ? 'soft' : 'primary'}
                                size="sm"
                                icon={saved[s] ? CheckCircle2 : BookmarkPlus}
                                disabled={saved[s]}
                                onClick={() => collect(s)}
                              >
                                {saved[s] ? '已收藏' : '收藏'}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}

                  {!isBusy && draft.content && (
                    <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                      <Button
                        size="lg"
                        icon={PenLine}
                        onClick={() =>
                          onGoWrite({
                            topic: session.topic,
                            genre,
                            outline,
                            questions: session.aiFeedback.scaffoldingQuestions,
                          })
                        }
                      >
                        我也来写一写
                      </Button>
                      <Button variant="soft" icon={RefreshCw} onClick={start}>
                        换一篇再看看
                      </Button>
                    </footer>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* 历史题目弹窗 */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="盲盒题目历史"
        description="这里存着你抽过的所有盲盒题目，看中哪一道随时可以选用。"
        maxWidth="46rem"
        icon={<History className="mt-0.5 size-6 text-sun-600" aria-hidden="true" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink-soft">体裁筛选</span>
              <Segmented
                value={historyFilter}
                onChange={setHistoryFilter}
                options={historyGenres}
                label="筛选体裁"
                size="sm"
              />
            </div>
            {historyList.length > 0 && (
              <Button
                variant={confirmClearHistory ? 'danger' : 'ghost'}
                size="sm"
                icon={Trash2}
                onClick={handleClearHistory}
              >
                {confirmClearHistory ? '确认清空全部历史' : '清空历史'}
              </Button>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-ink-mute">
              <p className="text-base font-bold text-ink-soft">
                {historyList.length === 0 ? '还没有盲盒题目历史' : '这个体裁下暂无历史题目'}
              </p>
              <p className="mt-1 text-sm">点击左上角的“换个盲盒题”抽取新题，都会自动存到这里。</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredHistory.map((item) => {
                const isCurrent = topic.trim() === item.topic.trim();
                return (
                  <li
                    key={item.id}
                    className={`group flex flex-col gap-3 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                      isCurrent
                        ? 'border-sun-300 bg-sun-50/60'
                        : 'border-line bg-white hover:border-sun-200 hover:bg-canvas/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge accent="sun">{item.genre}</Badge>
                        <span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-mute">
                          {item.gradeName}
                        </span>
                        {item.source === 'ai' && (
                          <span className="rounded-md bg-mint-50 px-2 py-0.5 text-xs font-semibold text-mint-700">
                            AI 盲盒
                          </span>
                        )}
                        <span className="text-xs text-ink-mute">{item.createdAt}</span>
                        {isCurrent && (
                          <span className="text-xs font-bold text-sun-700">当前正在使用</span>
                        )}
                      </div>
                      <p className="text-lg font-extrabold text-ink">《{item.topic}》</p>
                      {item.tip && (
                        <p className="text-sm leading-relaxed text-ink-soft">💡 {item.tip}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant={isCurrent ? 'soft' : 'primary'}
                        size="sm"
                        icon={CheckCircle2}
                        disabled={isCurrent}
                        onClick={() => pickFromHistory(item)}
                      >
                        {isCurrent ? '使用中' : '选用这题'}
                      </Button>
                      <button
                        type="button"
                        onClick={() => removeTopicHistory(item.id)}
                        className="grid size-9 place-items-center rounded-xl text-ink-mute transition-colors hover:bg-coral-50 hover:text-coral-600"
                        title="删除该记录"
                        aria-label={`删除题目《${item.topic}》`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>
    </div>
  );
};
