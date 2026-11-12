import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, Info } from 'lucide-react';
import type { EssayDraft, GoldenSnippet, SavedEssay } from './types';
import { AppShell, NAV, type LlmStatus, type PageId } from './components/AppShell';
import { HomePage } from './components/HomePage';
import { IdeaTrainer, type IdeaNote } from './components/IdeaTrainer';
import { WritingPad } from './components/WritingPad';
import { EssayCoach } from './components/EssayCoach';
import { SampleStudio } from './components/SampleStudio';
import { GoldenNotebook } from './components/GoldenNotebook';
import { ParentZone } from './components/ParentZone';
import { UpdateDialog } from './components/UpdateDialog';
import { INITIAL_GOLDEN_SNIPPETS } from './services/mockData';
import { checkLLMStatus, countChars } from './services/aiService';
import { checkForAppUpdates, type UpdateInfo } from './services/updateService';
import { useGradeProfile } from './services/libraryStore';
import { DEFAULT_GRADE, defaultGenre, GRADE_ORDER, type GradeLevel } from './data/gradeProfiles';
import type { TopicCard } from './data/topics';
import { inferGenreFromTitle, inferSnippetTag, normalizeDraftIndent } from './utils/text';

const GRADE_KEY = 'writing_master_grade';
const DRAFT_KEY = 'writing_master_draft';
const SNIPPETS_KEY = 'writing_master_snippets';
const ESSAYS_KEY = 'writing_master_essays';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`读取本地数据失败：${key}`, e);
  }
  return fallback;
}

export const App: React.FC = () => {
  const [grade, setGrade] = useState<GradeLevel>(() => {
    const saved = localStorage.getItem(GRADE_KEY) as GradeLevel | null;
    return saved && GRADE_ORDER.includes(saved) ? saved : DEFAULT_GRADE;
  });
  const profile = useGradeProfile(grade);

  const [page, setPage] = useState<PageId>('home');
  // 访问过的页面保持挂载（只是隐藏），这样切换页面不会丢掉 AI 刚生成的结果
  const [visited, setVisited] = useState<Set<PageId>>(() => new Set<PageId>(['home']));
  const [parentOpen, setParentOpen] = useState(false);
  const [parentTab, setParentTab] = useState<'model' | 'grade' | 'genre' | 'prompt' | 'data' | 'about'>('model');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  /* ── 启动 3 秒后静默检查更新 ── */
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const info = await checkForAppUpdates();
        if (info.hasUpdate) {
          setUpdateInfo(info);
          setUpdateModalOpen(true);
        }
      } catch (e) {
        console.debug('静默检查更新失败:', e);
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  const [snippets, setSnippets] = useState<GoldenSnippet[]>(() => readJSON(SNIPPETS_KEY, INITIAL_GOLDEN_SNIPPETS));
  const [savedEssays, setSavedEssays] = useState<SavedEssay[]>(() => readJSON(ESSAYS_KEY, []));
  const [draft, setDraft] = useState<EssayDraft>(() => {
    const saved = readJSON<Partial<EssayDraft>>(DRAFT_KEY, {});
    const rawTitle = saved.title || '';
    const rawContent = saved.content || '';
    const inferred = inferGenreFromTitle(rawTitle, profile.genres);
    return {
      title: rawTitle,
      content: rawContent ? normalizeDraftIndent(rawContent) : '',
      genre: inferred || saved.genre || '',
    };
  });
  const [ideaNote, setIdeaNote] = useState<IdeaNote | null>(null);
  const [preset, setPreset] = useState<(TopicCard & { nonce: number }) | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'info' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  /* ── 持久化 ── */
  useEffect(() => localStorage.setItem(GRADE_KEY, grade), [grade]);
  useEffect(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)), [draft]);
  useEffect(() => localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets)), [snippets]);
  useEffect(() => localStorage.setItem(ESSAYS_KEY, JSON.stringify(savedEssays)), [savedEssays]);

  /* ── 本地模型在线状态：启动阶段高频探测（1.2s），成功后转为常规 10s；失败超 20 次才判定 offline ── */
  const [llmStatus, setLlmStatus] = useState<LlmStatus>('starting');
  useEffect(() => {
    if (parentOpen) return;
    let cancelled = false;
    let attemptCount = 0;
    let intervalId: number | undefined;

    const check = async () => {
      const ok = await checkLLMStatus();
      if (cancelled) return;

      if (ok) {
        setLlmStatus('online');
        // 成功在线后，降频为常规 10 秒心跳
        if (intervalId) clearInterval(intervalId);
        intervalId = window.setInterval(check, 10000);
      } else {
        attemptCount++;
        // 刚启动前 20 次（约 24 秒）都维持 starting 苏醒中动画，给后台子进程留足启动窗口
        if (attemptCount >= 20) {
          setLlmStatus('offline');
          if (intervalId) clearInterval(intervalId);
          intervalId = window.setInterval(check, 8000);
        } else {
          setLlmStatus((prev) => (prev === 'online' ? 'starting' : prev));
        }
      }
    };

    check();
    intervalId = window.setInterval(check, 1200);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [parentOpen]);

  /* ── 导航 ── */
  const navigate = useCallback((p: PageId) => {
    setPage(p);
    setVisited((v) => (v.has(p) ? v : new Set(v).add(p)));
  }, []);

  // 切换页面后：滚回顶部、焦点移到主区域、更新窗口标题
  const firstRender = useRef(true);
  useEffect(() => {
    const label = NAV.find((n) => n.id === page)?.label ?? '';
    document.title = `${label} · 小语作文`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [page]);

  /* ── 提示 ── */
  const notify = useCallback((text: string, tone: 'ok' | 'info' = 'ok') => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  /* ── 收藏好句 ── */
  const addSnippet = (text: string, sourceTitle: string, tag: any, explanation: string) => {
    if (snippets.some((s) => s.text === text)) {
      notify('这句已经在好词好句本里啦', 'info');
      return;
    }
    const resolvedTag = !tag || tag === '未分类' || tag === '自动识别' ? inferSnippetTag(text, undefined, explanation) : tag;
    const item: GoldenSnippet = {
      id: `snip-${Date.now()}`,
      text,
      sourceTitle,
      tag: resolvedTag,
      explanation,
      createdAt: new Date().toLocaleDateString('zh-CN'),
    };
    setSnippets((prev) => [item, ...prev]);
    notify(`已收藏到好词好句本（分类：${resolvedTag}）`);
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#3d8e9c', '#f2b23a', '#3fae80', '#ee7a65'],
        disableForReducedMotion: true,
      });
    } catch {
      // 动画失败不影响收藏
    }
  };

  /* ── 收藏好文章（范文、示范成文、升格作文、修改稿） ── */
  const isEssaySaved = useCallback(
    (title: string, content: string) => {
      const t = title.trim();
      const c = content.trim();
      return Boolean(c) && savedEssays.some((e) => e.title.trim() === t && e.content.trim() === c);
    },
    [savedEssays]
  );

  const addSavedEssay = (input: Omit<SavedEssay, 'id' | 'wordCount' | 'createdAt'>) => {
    const title = input.title.trim() || '未命名作文';
    const content = input.content.trim();
    if (!content) return;
    if (isEssaySaved(title, content)) {
      notify('这篇文章已经在好词好句本里啦', 'info');
      return;
    }
    const item: SavedEssay = {
      id: `essay-${Date.now()}`,
      title,
      content,
      genre: input.genre,
      gradeName: input.gradeName,
      kind: input.kind,
      wordCount: countChars(content),
      createdAt: new Date().toLocaleDateString('zh-CN'),
    };
    setSavedEssays((prev) => [item, ...prev]);
    notify(`已把《${title}》整篇收藏到好词好句本`);
    try {
      confetti({
        particleCount: 55,
        spread: 65,
        origin: { y: 0.8 },
        colors: ['#3d8e9c', '#f2b23a', '#3fae80', '#ee7a65'],
        disableForReducedMotion: true,
      });
    } catch {
      // 动画失败不影响收藏
    }
  };

  /* ── 跨页面的流转：想 → 写 → 改 ── */
  const patchDraft = (patch: Partial<EssayDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const goWrite = (note: IdeaNote) => {
    setIdeaNote(note.outline.trim() || note.questions.length > 0 ? note : null);
    // 从“想一想”点击“我来写一写 / 去写一写”跳转时，始终同步带过当前题目与体裁
    patchDraft({ title: note.topic, genre: note.genre });
    navigate('write');
  };

  const pickTopic = (card: TopicCard) => {
    setPreset({ ...card, nonce: Date.now() });
    navigate('idea');
  };

  // 草稿的体裁为空时，用当前年级的默认体裁
  const draftWithGenre: EssayDraft = { ...draft, genre: draft.genre || defaultGenre(profile) };

  const keepAlive = (id: PageId, node: React.ReactNode) =>
    visited.has(id) ? (
      <div key={id} hidden={page !== id}>
        {node}
      </div>
    ) : null;

  return (
    <>
      <AppShell
        page={page}
        onNavigate={navigate}
        grade={grade}
        onGradeChange={setGrade}
        snippetCount={snippets.length + savedEssays.length}
        llmStatus={llmStatus}
        onOpenParentZone={() => {
          setParentTab('model');
          setParentOpen(true);
        }}
        onOpenAbout={() => {
          setParentTab('about');
          setParentOpen(true);
        }}
      >
        {keepAlive(
          'home',
          <HomePage
            profile={profile}
            snippets={snippets}
            savedEssays={savedEssays}
            llmStatus={llmStatus}
            onNavigate={navigate}
            onPickTopic={pickTopic}
          />
        )}
        {keepAlive(
          'idea',
          <IdeaTrainer
            profile={profile}
            preset={preset}
            onAddGoldenSnippet={addSnippet}
            onSaveEssay={addSavedEssay}
            isEssaySaved={isEssaySaved}
            onGoWrite={goWrite}
          />
        )}
        {keepAlive(
          'write',
          <WritingPad
            profile={profile}
            draft={draftWithGenre}
            onDraftChange={patchDraft}
            ideaNote={ideaNote}
            onDismissIdeaNote={() => setIdeaNote(null)}
            onGoCoach={() => navigate('coach')}
          />
        )}
        {keepAlive(
          'coach',
          <EssayCoach
            profile={profile}
            draft={draftWithGenre}
            onDraftChange={patchDraft}
            onAddGoldenSnippet={addSnippet}
            onSaveEssay={addSavedEssay}
            isEssaySaved={isEssaySaved}
          />
        )}
        {keepAlive(
          'learn',
          <SampleStudio
            profile={profile}
            onAddGoldenSnippet={addSnippet}
            onSaveEssay={addSavedEssay}
            isEssaySaved={isEssaySaved}
          />
        )}
        {keepAlive(
          'notebook',
          <GoldenNotebook
            gradeName={profile.name}
            snippets={snippets}
            onRemoveSnippet={(id) => setSnippets((prev) => prev.filter((s) => s.id !== id))}
            onUpdateSnippetTag={(id, nextTag) =>
              setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, tag: nextTag } : s)))
            }
            onAddSnippet={(text, source, tag, explanation) => addSnippet(text, source, tag, explanation)}
            savedEssays={savedEssays}
            onRemoveEssay={(id) => setSavedEssays((prev) => prev.filter((e) => e.id !== id))}
            onSaveEssay={addSavedEssay}
          />
        )}
      </AppShell>

      <ParentZone
        open={parentOpen}
        onClose={() => setParentOpen(false)}
        currentGrade={grade}
        initialTab={parentTab}
      />

      {updateInfo && (
        <UpdateDialog
          open={updateModalOpen}
          onClose={() => setUpdateModalOpen(false)}
          updateInfo={updateInfo}
        />
      )}

      {/* 轻提示 */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
        {toast && (
          <p
            role="status"
            className="anim-fade-up pointer-events-auto flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-base font-semibold text-white shadow-pop"
          >
            {toast.tone === 'ok' ? (
              <CheckCircle2 className="size-5 text-mint-200" aria-hidden="true" />
            ) : (
              <Info className="size-5 text-sky-200" aria-hidden="true" />
            )}
            {toast.text}
          </p>
        )}
      </div>
    </>
  );
};

export default App;
