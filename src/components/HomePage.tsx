import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Dices, Sparkles, Target } from 'lucide-react';
import { Mascot } from './Mascot';
import { ACCENT, Badge, Button, Card } from './ui';
import { NAV, type LlmStatus, type PageId } from './AppShell';
import type { GoldenSnippet, SavedEssay } from '../types';
import type { GradeProfile } from '../data/gradeProfiles';
import type { TopicCard } from '../data/topics';
import { drawBlindBoxTopic } from '../services/aiService';
import { addTopicHistory } from '../services/topicHistoryStore';

interface HomePageProps {
  profile: GradeProfile;
  snippets: GoldenSnippet[];
  savedEssays: SavedEssay[];
  llmStatus: LlmStatus;
  onNavigate: (p: PageId) => void;
  onPickTopic: (card: TopicCard) => void;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
};

export const HomePage: React.FC<HomePageProps> = ({
  profile,
  snippets,
  savedEssays,
  llmStatus,
  onNavigate,
  onPickTopic,
}) => {
  const [card, setCard] = useState<TopicCard | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // 切换年级时清空当前盲盒题，等用户点击再由 AI 当场生成
  useEffect(() => {
    setCard(null);
    setRollError(null);
  }, [profile.id, profile.stage]);

  const rollTopic = async () => {
    if (drawing) return;
    setDrawing(true);
    setRollError(null);
    try {
      const res = await drawBlindBoxTopic({ profile, currentTopic: card?.topic });
      setCard(res.card);
      addTopicHistory({
        topic: res.card.topic,
        genre: res.card.genre,
        tip: res.card.tip,
        gradeName: profile.name,
        source: 'ai',
      });
    } catch (e: any) {
      setRollError(e?.message || 'AI 出题失败，请检查模型服务是否已启动');
    } finally {
      setDrawing(false);
    }
  };

  const flow = useMemo(() => NAV.filter((n) => n.step), []);
  const recent = snippets.slice(0, 2);

  return (
    <div className="space-y-8">
      {/* 欢迎横幅 */}
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-brand-600 px-6 py-8 text-white sm:px-10 sm:py-10">
        {/* 装饰圆 */}
        <span aria-hidden="true" className="absolute -top-16 -right-10 -z-10 size-64 rounded-full bg-brand-500/60" />
        <span aria-hidden="true" className="absolute -right-24 -bottom-24 -z-10 size-72 rounded-full bg-brand-700/60" />

        <div className="flex items-center justify-between gap-6">
          <div className="max-w-xl space-y-4">
            <Badge accent="sun" className="bg-sun-100! text-sun-700!">
              <Sparkles className="size-4" aria-hidden="true" />
              {profile.name} · {profile.stageName}
            </Badge>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{greeting()}，小作家！</h1>
            <p className="text-lg leading-relaxed text-brand-50">
              {llmStatus === 'starting'
                ? '小导师正在整理讲台赶来教室，马上就来陪你写作文…'
                : llmStatus === 'offline'
                ? 'AI 老师还没醒，请让爸爸妈妈先启动模型服务，然后我们就可以开始啦。'
                : '写作文就像讲故事。想好了就写，写完了让老师帮你改一改，每次都会进步一点点。'}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('idea')}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-lg font-bold text-brand-800 shadow-[0_3px_0_0_var(--color-brand-800)] transition-[transform,box-shadow] hover:bg-brand-50 active:translate-y-[3px] active:shadow-none"
              >
                从“想一想”开始
                <ArrowRight className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('write')}
                className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/40 px-5 py-3 text-lg font-bold text-white transition-colors hover:bg-white/10"
              >
                直接去写
              </button>
            </div>
          </div>
          <div className="relative hidden shrink-0 sm:block">
            <Mascot mood={llmStatus === 'starting' ? 'think' : 'hello'} size={168} bob />
            {llmStatus === 'starting' && (
              <span className="absolute -top-1 -right-2 flex items-center gap-1 rounded-full bg-sun-300 px-3 py-1 text-xs font-black text-sun-900 shadow-lg animate-bounce">
                <Sparkles className="size-3.5" />
                正在苏醒
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 写作四步 */}
      <section aria-labelledby="flow-title" className="space-y-4">
        <h2 id="flow-title" className="text-xl font-extrabold text-ink">
          写作四步，一步一步来
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {flow.map((n) => {
            const Icon = n.icon;
            const a = ACCENT[n.accent];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(n.id)}
                  className="group flex h-full w-full flex-col gap-4 rounded-3xl border border-line bg-surface p-5 text-left shadow-card transition-[transform,border-color] hover:border-brand-200 motion-safe:hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className={`grid size-14 place-items-center rounded-2xl ${a.tile}`}>
                      <Icon className="size-7" aria-hidden="true" strokeWidth={2.2} />
                    </span>
                    <span className="text-sm font-extrabold text-ink-mute">第 {n.step} 步</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xl font-extrabold text-ink">{n.label}</p>
                    <p className="text-base text-ink-soft">{STEP_DESC[n.id]}</p>
                  </div>
                  <span className={`mt-auto inline-flex items-center gap-1 text-base font-bold ${a.text}`}>
                    进入
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 今日盲盒题 + 年级小目标 */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card as="section" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <Dices className="size-5 text-sun-700" aria-hidden="true" />
              今日盲盒题
            </h2>
            {card && (
              <Button variant="soft" size="sm" icon={Dices} loading={drawing} onClick={rollTopic}>
                {drawing ? 'AI 出题中…' : 'AI 换一题'}
              </Button>
            )}
          </div>
          {card ? (
            <>
              <div className="rounded-2xl bg-sun-50 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge accent="sun">{card.genre}</Badge>
                  <Badge accent="brand">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    AI 新鲜出题{card.model ? ` · ${card.model}` : ''}
                  </Badge>
                </div>
                <p className="mt-3 text-2xl font-extrabold text-ink">《{card.topic}》</p>
                <p className="mt-2 text-base text-ink-soft">💡 {card.tip}</p>
              </div>
              {rollError && <p className="text-sm font-semibold text-coral-700">{rollError}</p>}
              <Button size="lg" icon={ArrowRight} onClick={() => onPickTopic(card)}>
                就写这个！
              </Button>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sun-300 bg-sun-50/60 px-6 py-8 text-center">
              <p className="text-base font-bold text-ink">还没有决定写什么题目？</p>
              <p className="text-sm text-ink-soft">点一下盲盒，让 AI 小导师当场为你出一道适合{profile.name}的新鲜作文题！</p>
              {rollError && <p className="text-sm font-semibold text-coral-700">{rollError}</p>}
              <Button icon={Dices} loading={drawing} onClick={rollTopic} className="mt-1">
                {drawing ? 'AI 出题中…' : '抽个 AI 盲盒题'}
              </Button>
            </div>
          )}
        </Card>

        <Card as="section" className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <Target className="size-5 text-brand-600" aria-hidden="true" />
            {profile.name}的小目标
          </h2>
          <ul className="space-y-2.5">
            {profile.focus.map((f) => (
              <li key={f} className="flex items-start gap-3 text-base text-ink">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
          <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-soft">
            作文字数参考：<strong className="text-ink">{profile.defaultWordCount} 字左右</strong>
          </p>
        </Card>
      </div>

      {/* 好词好句本预览 */}
      <Card as="section" tone="grape" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Bookmark className="size-5" aria-hidden="true" />
            好词好句本 · 已收藏 {snippets.length} 句好词句、{savedEssays.length} 篇好文章
          </h2>
          <Button variant="soft" size="sm" onClick={() => onNavigate('notebook')}>
            去翻翻
          </Button>
        </div>
        {recent.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {recent.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white/80 p-4">
                <p className="paper-reading text-base text-ink">“{s.text}”</p>
                <p className="mt-2 text-sm text-ink-mute">{s.sourceTitle}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-base text-ink-soft">还没有收藏。在“学一学”里划选喜欢的句子，就能存到这里。</p>
        )}
      </Card>
    </div>
  );
};

const STEP_DESC: Partial<Record<PageId, string>> = {
  idea: '不用写长文，先把想法说出来，小导师帮你想细节。',
  write: '在稿纸上动手写，卡住了可以问问小导师。',
  coach: '写完了让老师打分、挑毛病，再看看高分版本。',
  learn: '看一篇同年级的范文，学学好句子是怎么写的。',
};

