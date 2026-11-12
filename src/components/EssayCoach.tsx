import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookmarkPlus,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lightbulb,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { CorrectionReport, EssayDraft, SavedEssay } from '../types';
import { resolveGenre, type GradeProfile } from '../data/gradeProfiles';
import { SAMPLE_CORRECTION_REPORT } from '../services/mockData';
import { compareEssays, countChars, diagnoseEssay, upgradeEssay } from '../services/aiService';
import { rubricTotal } from '../services/prompts';
import { PhotoUploader } from './PhotoUploader';
import {
  analyzeEssayCompleteness,
  inferGenreFromTitle,
  inferSnippetTag,
  normalizeDraftIndent,
  type EssayCompletenessInfo,
} from '../utils/text';
import {
  type Accent,
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
  ProgressBar,
  Segmented,
  StepHeading,
  StepTracker,
  Tabs, PasteCleanTextarea } from './ui';

interface EssayCoachProps {
  profile: GradeProfile;
  draft: EssayDraft;
  onDraftChange: (patch: Partial<EssayDraft>) => void;
  onAddGoldenSnippet: (text: string, title: string, tag: any, explanation: string) => void;
  onSaveEssay: (essay: Omit<SavedEssay, 'id' | 'wordCount' | 'createdAt'>) => void;
  isEssaySaved: (title: string, content: string) => boolean;
}

type ViewMode = 'comparison' | 'upgraded' | 'diagnostics';
type Stage = 'idle' | 'diagnosing' | 'upgrading' | 'comparing';

const lastSentence = (text: string) => {
  const parts = text
    .split(/(?<=[。！？])/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || '';
};

/** 按完篇情况与得分率给出针对性的总评标签与提示 */
const scoreLabel = (
  ratio: number,
  comp: EssayCompletenessInfo | null,
  gradeName: string
): { tag: string; tip: string; accent: Accent } => {
  if (comp?.isUnfinished) {
    return {
      tag: '尚未写完 · 结构不完整',
      accent: 'coral',
      tip: `全文目前仅 ${comp.charCount} 字（共 ${comp.paraCount} 个自然段），比${gradeName}要求的 ${comp.targetWords} 字还差 ${comp.shortfall} 字。先把中间具体事例和结尾写完整，分数会大幅提升！`,
    };
  }
  if (comp?.isUnderLength) {
    return {
      tag: '字数未达标 · 需补充展开',
      accent: 'sun',
      tip: `目前 ${comp.charCount} 字，距离${gradeName}要求的 ${comp.targetWords} 字还差 ${comp.shortfall} 字。把中间段落的动作、语言、心理细节写饱满就能达标提分！`,
    };
  }
  if (ratio >= 0.9) {
    return { tag: '优秀 · 接近满分', accent: 'mint', tip: '细节与情感都很出色，再打磨一下用词就更完美了！' };
  }
  if (ratio >= 0.76) {
    return { tag: '良好 · 继续加油', accent: 'mint', tip: '基础扎实，补足细节就能冲进满分圈！' };
  }
  if (ratio >= 0.6) {
    return { tag: '中等 · 潜力很大', accent: 'sun', tip: '保留真实好故事，再补足细节，进步会很明显！' };
  }
  return { tag: '加油 · 进步空间大', accent: 'sun', tip: '别灰心，先把内容写具体，每次进步一点点就很棒。' };
};

export const EssayCoach: React.FC<EssayCoachProps> = ({
  profile,
  draft,
  onDraftChange,
  onAddGoldenSnippet,
  onSaveEssay,
  isEssaySaved,
}) => {
  const genre = resolveGenre(profile, draft.genre);
  const [photo, setPhoto] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [report, setReport] = useState<CorrectionReport | null>(null);
  const [view, setView] = useState<ViewMode>('diagnostics');
  const [error, setError] = useState<string | null>(null);
  const isBusy = stage !== 'idle';
  const count = countChars(draft.content);
  const total = rubricTotal(profile.rubric);

  const start = async () => {
    if (!draft.content.trim()) return setError('先把作文放进来：可以在“写一写”里写，也可以直接粘贴到这里。');
    const title = draft.title.trim();
    const essay = draft.content.trim();
    const ctx = { profile, genre };

    setError(null);
    setReport(null);
    try {
      // 第 1 步：评分 + 诊断
      setStage('diagnosing');
      const { score, diagnostics } = await diagnoseEssay({ ...ctx, title, essay });
      setReport({
        id: `report-${Date.now()}`,
        originalTitle: title,
        originalContent: essay,
        originalImageUri: photo || undefined,
        score,
        diagnostics,
        upgradedEssay: { title, content: '', wordCount: 0 },
        diffComparisons: [],
        createdAt: new Date().toLocaleString('zh-CN'),
      });
      setView('diagnostics');

      // 第 2 步：保真升格（流式）。停在“诊断”页让孩子先读，升格在后台继续写
      setStage('upgrading');
      const upgraded = await upgradeEssay({
        ...ctx,
        title,
        essay,
        suggestions: diagnostics.improvementSuggestions,
        onText: (newTitle, body) =>
          setReport((prev) =>
            prev
              ? {
                  ...prev,
                  upgradedEssay: {
                    title: newTitle || prev.upgradedEssay.title,
                    content: body,
                    wordCount: countChars(body),
                  },
                }
              : prev
          ),
      });

      // 第 3 步：提取“变身”对比
      setStage('comparing');
      const diffComparisons = await compareEssays({ ...ctx, original: essay, upgraded: upgraded.body });
      setReport((prev) => (prev ? { ...prev, diffComparisons } : prev));
    } catch (err: any) {
      console.error('批改出错:', err);
      setError(err.message || '批改失败，请检查模型服务是否已启动');
    } finally {
      setStage('idle');
    }
  };

  const trackerCurrent = stage === 'diagnosing' ? 0 : stage === 'upgrading' ? 1 : stage === 'comparing' ? 2 : report ? 3 : -1;
  const reportComp = report ? analyzeEssayCompleteness(report.originalContent, profile.defaultWordCount) : null;
  const label = report ? scoreLabel(report.score.total / total, reportComp, profile.name) : null;
  const rubricRows = (['structure', 'wording', 'emotion'] as const).map((k) => ({
    key: k,
    ...profile.rubric[k],
    value: report?.score[k] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        accent="mint"
        icon={ClipboardCheck}
        title="改一改"
        subtitle="让老师给作文打分、挑挑毛病，再看看保留你的故事的高分版本。"
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 左：放进作文 */}
        <Card className="space-y-5 xl:sticky xl:top-6">
          <StepHeading n={1} accent="mint">
            放进你的作文
          </StepHeading>

          <PhotoUploader
            imagePreview={photo}
            onImageSelected={setPhoto}
            label="拍下手写作文"
            hint="拍照后文字识别功能开发中"
            note="识别功能即将上线"
          />

          <Field label="作文题目">
            {(id) => (
              <input
                id={id}
                value={draft.title}
                onChange={(e) => {
                  const next = e.target.value;
                  const inferred = inferGenreFromTitle(next, profile.genres);
                  onDraftChange({ title: next, ...(inferred ? { genre: inferred } : {}) });
                }}
                placeholder="你的作文题目"
                className={`${INPUT_CLASS} font-bold`}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <p className="text-base font-semibold text-ink">体裁</p>
            <Segmented value={genre} onChange={(g) => onDraftChange({ genre: g })} options={profile.genres} label="作文体裁" size="sm" />
          </div>

          <Field
            label="作文正文"
            right={
              <button
                type="button"
                onClick={() =>
                  onDraftChange({
                    title: SAMPLE_CORRECTION_REPORT.originalTitle,
                    content: normalizeDraftIndent(SAMPLE_CORRECTION_REPORT.originalContent),
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-mint-700 hover:bg-mint-50"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                载入示例
              </button>
            }
          >
            {(id) => (
              <PasteCleanTextarea
                id={id}
                rows={10}
                indentParagraphs
                value={draft.content}
                onChange={(e) => onDraftChange({ content: e.target.value })}
                placeholder="　　把作文粘贴或输入到这里；在“写一写”里写的作文会自动出现在这里。"
                className={`${INPUT_CLASS} resize-y leading-relaxed`}
              />
            )}
          </Field>
          <div className="-mt-3">
            <CountChip count={count} target={profile.defaultWordCount} />
          </div>

          {error && <Banner tone="error" title="出了点小问题">{error}</Banner>}

          <Button size="lg" block icon={Sparkles} loading={isBusy} onClick={start}>
            {stage === 'diagnosing'
              ? '老师正在打分…'
              : stage === 'upgrading'
              ? '正在保真升格…'
              : stage === 'comparing'
              ? '正在整理对比…'
              : '请老师批改'}
          </Button>
        </Card>

        {/* 右：结果 */}
        <div className="space-y-5">
          {!report && !isBusy && (
            <EmptyState mood="write" title="把作文交给老师吧">
              老师会给你打分、找出可以改进的地方，还会保留你的故事，帮你升级成高分作文。
            </EmptyState>
          )}

          {(report || isBusy) && (
            <Card>
              <StepTracker steps={['打分诊断', '保真升格', '找对比']} current={trackerCurrent} accent="mint" label="批改进度" />
            </Card>
          )}

          {report && label && (
            <>
              {/* 成绩卡 */}
              <Card as="section" className="anim-fade-up flex flex-wrap items-center gap-6">
                <div
                  role="img"
                  aria-label={`总分 ${report.score.total} 分，满分 ${total} 分`}
                  className="grid size-28 shrink-0 place-items-center rounded-full border-[10px] border-mint-100 bg-mint-50"
                >
                  <div className="text-center leading-none">
                    <p className="text-4xl font-extrabold text-mint-700">{report.score.total}</p>
                    <p className="mt-1 text-sm font-bold text-ink-mute">/ {total}</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 basis-60 space-y-3">
                  <div>
                    <Badge accent={label.accent}>{label.tag}</Badge>
                    <p className="mt-1.5 text-base text-ink-soft">{label.tip}</p>
                  </div>
                  <ul className="space-y-2">
                    {rubricRows.map((r) => (
                      <li key={r.key} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm">
                        <span className="font-semibold text-ink">{r.label}</span>
                        <ProgressBar value={r.value} max={r.max} accent="mint" label={`${r.label} ${r.value} 分，满分 ${r.max}`} />
                        <span className="text-right font-bold text-ink-soft">
                          {r.value}/{r.max}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              <Tabs<ViewMode>
                label="批改结果"
                value={view}
                onChange={(v) => setView(v)}
                tabs={[
                  { value: 'comparison', label: '看对比', icon: TrendingUp, badge: stage === 'comparing' ? '整理中' : undefined },
                  { value: 'upgraded', label: '升格全文', icon: FileText, badge: stage === 'upgrading' ? '写作中' : undefined },
                  { value: 'diagnostics', label: '老师的诊断', icon: AlertTriangle },
                ]}
              />

              {/* 看对比 */}
              {view === 'comparison' && (
                <section role="tabpanel" aria-label="升格前后对比" className="space-y-4">
                  {report.diffComparisons.length === 0 && (
                    <Banner tone="info" title={isBusy ? '对比还在整理中' : '这次没有提取到合适的对比'}>
                      {isBusy ? '先去看看“升格全文”和“老师的诊断”吧。' : '可以直接看“升格全文”。'}
                    </Banner>
                  )}
                  {report.diffComparisons.map((d, i) => {
                    const compTag = inferSnippetTag(d.upgradedExcerpt, report.upgradedEssay.content, d.technique);
                    return (
                      <Card key={i} className="anim-fade-up space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge accent="mint">
                            <Award className="size-4" aria-hidden="true" />
                            {d.technique}
                          </Badge>
                          <Button
                            variant="soft"
                            size="sm"
                            icon={BookmarkPlus}
                            onClick={() =>
                              onAddGoldenSnippet(
                                d.upgradedExcerpt,
                                `《${report.upgradedEssay.title || draft.title || '升格作文'}》`,
                                compTag,
                                d.technique
                              )
                            }
                          >
                            收藏升格好句（{compTag}）
                          </Button>
                        </div>
                        <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
                          <div className="rounded-2xl bg-coral-50 p-4">
                            <p className="mb-1 text-sm font-extrabold text-coral-700">你原来这样写</p>
                            <p className="paper-reading text-base text-ink">“{d.originalExcerpt}”</p>
                          </div>
                          <ArrowRight className="mx-auto size-6 self-center rotate-90 text-ink-mute md:rotate-0" aria-hidden="true" />
                          <div className="rounded-2xl bg-mint-50 p-4">
                            <p className="mb-1 text-sm font-extrabold text-mint-700">升格后</p>
                            <p className="paper-reading text-base font-medium text-ink">“{d.upgradedExcerpt}”</p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </section>
              )}

              {/* 升格全文 */}
              {view === 'upgraded' && (
                <Card as="article" className="space-y-5">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                    <div className="min-w-0">
                      <Badge accent="mint">{profile.name}升格版</Badge>
                      <h2 className="mt-2 text-2xl font-extrabold text-ink">{report.upgradedEssay.title}</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CountChip count={report.upgradedEssay.wordCount} target={profile.defaultWordCount} />
                      {stage !== 'upgrading' && !!report.upgradedEssay.content && (
                        <Button
                          variant={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? 'soft' : 'primary'}
                          size="sm"
                          icon={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? CheckCircle2 : BookmarkPlus}
                          disabled={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content)}
                          onClick={() =>
                            onSaveEssay({
                              title: report.upgradedEssay.title,
                              content: report.upgradedEssay.content,
                              genre,
                              gradeName: profile.name,
                              kind: '升格作文',
                            })
                          }
                        >
                          {isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? '已收藏全文' : '收藏升格全文'}
                        </Button>
                      )}
                    </div>
                  </header>
                  <EssayPaper
                    role="tabpanel"
                    aria-label="升格全文"
                    content={report.upgradedEssay.content}
                    streaming={stage === 'upgrading'}
                    placeholder={
                      stage === 'upgrading' ? (
                        <span className="text-ink-mute italic">老师正在保留你的故事，认真升格中…</span>
                      ) : null
                    }
                  />
                  {!!lastSentence(report.upgradedEssay.content) && stage !== 'upgrading' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mint-50 p-4">
                      <span className="flex items-center gap-2 text-base font-semibold text-mint-700">
                        <Sparkles className="size-5" aria-hidden="true" />
                        喜欢这篇升格版？可以收藏结尾好句或整篇文章
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="soft"
                          size="sm"
                          icon={BookmarkPlus}
                          onClick={() =>
                            onAddGoldenSnippet(
                              lastSentence(report.upgradedEssay.content),
                              `《${report.upgradedEssay.title}》`,
                              '开头结尾',
                              '升格后作文的结尾句'
                            )
                          }
                        >
                          收藏结尾句
                        </Button>
                        <Button
                          variant={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? 'soft' : 'primary'}
                          size="sm"
                          icon={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? CheckCircle2 : BookmarkPlus}
                          disabled={isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content)}
                          onClick={() =>
                            onSaveEssay({
                              title: report.upgradedEssay.title,
                              content: report.upgradedEssay.content,
                              genre,
                              gradeName: profile.name,
                              kind: '升格作文',
                            })
                          }
                        >
                          {isEssaySaved(report.upgradedEssay.title, report.upgradedEssay.content) ? '已收藏全文' : '收藏升格全文'}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* 诊断 */}
              {view === 'diagnostics' && (
                <section role="tabpanel" aria-label="老师的诊断" className="space-y-4">
                  {/* 若未写完或字数不达标，首要问题置顶展示，第一眼指出没写完与结构残缺 */}
                  {(reportComp?.isUnfinished || reportComp?.isUnderLength) &&
                    report.diagnostics.runOnSentenceWarning.length > 0 && (
                      <Card tone="sun" className="space-y-3">
                        <h2 className="flex items-center gap-2 text-base font-extrabold">
                          <AlertTriangle className="size-5" aria-hidden="true" />
                          {reportComp?.isUnfinished
                            ? '首要问题：文章还没写完，结构不完整'
                            : '首要问题：篇幅尚未达标，需扩充细节'}
                        </h2>
                        <ul className="space-y-2">
                          {report.diagnostics.runOnSentenceWarning.map((w, i) => (
                            <li key={i} className="text-justify-zh rounded-xl bg-white/85 p-3 text-base leading-relaxed text-ink">
                              {w}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                  <Card tone="mint" className="space-y-3">
                    <h2 className="flex items-center gap-2 text-base font-extrabold">
                      <CheckCircle2 className="size-5" aria-hidden="true" />
                      {reportComp?.isUnfinished ? '已写部分的闪光点' : '你的闪光点'}
                    </h2>
                    <ul className="space-y-2">
                      {report.diagnostics.goodPoints.map((p, i) => (
                        <li key={i} className="text-justify-zh rounded-xl bg-white/80 p-3 text-base leading-relaxed text-ink">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </Card>

                  {!reportComp?.isUnfinished &&
                    !reportComp?.isUnderLength &&
                    report.diagnostics.runOnSentenceWarning.length > 0 && (
                      <Card tone="sun" className="space-y-3">
                        <h2 className="flex items-center gap-2 text-base font-extrabold">
                          <AlertTriangle className="size-5" aria-hidden="true" />
                          这些地方可以写得更具体
                        </h2>
                        <ul className="space-y-2">
                          {report.diagnostics.runOnSentenceWarning.map((w, i) => (
                            <li key={i} className="text-justify-zh rounded-xl bg-white/80 p-3 text-base leading-relaxed text-ink">
                              {w}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}

                  <Card className="space-y-3">
                    <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
                      <Lightbulb className="size-5 text-sun-700" aria-hidden="true" />
                      {reportComp?.isUnfinished ? '续写与提分小妙招' : '提分小妙招'}
                    </h2>
                    <ul className="space-y-2">
                      {report.diagnostics.improvementSuggestions.map((p, i) => (
                        <li key={i} className="text-justify-zh rounded-xl bg-sun-50 p-3 text-base leading-relaxed text-ink">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card className="space-y-3">
                    <h2 className="text-base font-extrabold text-ink">字词句检查</h2>
                    {report.diagnostics.typosAndGrammar.length === 0 ? (
                      <p className="rounded-xl bg-mint-50 p-3 text-base text-mint-700">没有发现错别字和病句，书写很认真！</p>
                    ) : (
                      <ul className="space-y-3">
                        {report.diagnostics.typosAndGrammar.map((t, i) => (
                          <li key={i} className="space-y-1.5 rounded-2xl bg-canvas p-4">
                            <p className="flex flex-wrap items-center gap-2 text-base">
                              <del className="text-coral-700">“{t.error}”</del>
                              <ArrowRight className="size-4 text-ink-mute" aria-hidden="true" />
                              <strong className="text-mint-700">“{t.fix}”</strong>
                            </p>
                            <p className="text-justify-zh text-sm text-ink-soft">老师提示：{t.reason}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
