import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FileUp,
  Laptop,
  Loader2,
  Mic,
  Play,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-react';
import { Dialog } from './Dialog';
import { Mascot } from './Mascot';
import { Badge, Banner, Button, Card, Field, INPUT_CLASS, Segmented, Tabs } from './ui';
import { loadConfig, saveConfig, type AppConfig } from '../services/configService';
import {
  checkLLMStatus,
  listAvailableModels,
  loadRemoteModel,
  unloadAllRemoteModels,
  unloadRemoteModel,
  type RemoteModelInfo,
} from '../services/aiService';
import {
  APP_VERSION,
  checkForAppUpdates,
  getClientPlatform,
  GITHUB_REPO,
  isTauriApp,
  openExternalUrl,
  performInAppUpdate,
  type UpdateInfo,
} from '../services/updateService';
import {
  exportLibrary,
  getGenreGuide,
  getGradeProfile,
  getPromptTemplate,
  hasAnyModification,
  importLibrary,
  isGenreModified,
  isGradeModified,
  isPromptModified,
  listGenres,
  resetAllLibrary,
  resetGenreGuide,
  resetGradeProfile,
  resetPromptTemplate,
  saveGenreGuide,
  saveGradeProfile,
  savePromptTemplate,
  useLibraryVersion,
} from '../services/libraryStore';
import { DEFAULT_GENRE_GUIDES } from '../data/genres';
import {
  DEFAULT_GRADE_PROFILES,
  GRADE_GROUPS,
  GRADE_ORDER,
  type GradeLevel,
  type GradeProfile,
} from '../data/gradeProfiles';
import { DEFAULT_PROMPT_TASKS, PROMPT_VARIABLES, type PromptTaskId } from '../data/promptTemplates';
import { renderTask } from '../services/prompts';

interface ParentZoneProps {
  open: boolean;
  onClose: () => void;
  /** 当前年级：打开家长区时默认选中它 */
  currentGrade: GradeLevel;
  /** 默认打开的标签 */
  initialTab?: TabId;
}

type TabId = 'model' | 'grade' | 'genre' | 'prompt' | 'data' | 'about';

const TEXTAREA = `${INPUT_CLASS} resize-y leading-relaxed text-base`;

/* ───────────────────────────── 公共小件 ───────────────────────────── */

const SaveBar: React.FC<{
  dirty: boolean;
  modified: boolean;
  onSave: () => void;
  onReset: () => void;
  saved: boolean;
  resetLabel?: string;
}> = ({ dirty, modified, onSave, onReset, saved, resetLabel = '恢复默认' }) => (
  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
    <Button icon={Save} disabled={!dirty} onClick={onSave}>
      保存修改
    </Button>
    <Button variant="ghost" icon={RotateCcw} disabled={!modified && !dirty} onClick={onReset}>
      {resetLabel}
    </Button>
    {saved && !dirty && (
      <span role="status" className="text-sm font-semibold text-mint-700">
        已保存，马上生效
      </span>
    )}
    {modified && <Badge accent="sun">已自定义</Badge>}
  </div>
);

const GradeSelect: React.FC<{ value: GradeLevel; onChange: (g: GradeLevel) => void; id: string }> = ({ value, onChange, id }) => {
  useLibraryVersion();
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as GradeLevel)}
      className={`${INPUT_CLASS} font-bold`}
    >
      {GRADE_GROUPS.map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.grades.map((id) => (
            <option key={id} value={id}>
              {getGradeProfile(id).name}
              {isGradeModified(id) ? '（已自定义）' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

/* ───────────────────────────── 模型连接 ───────────────────────────── */

const ModelTab: React.FC = () => {
  const [cfg, setCfg] = useState<AppConfig>(loadConfig);
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<RemoteModelInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyModels, setBusyModels] = useState<Record<string, 'loading' | 'unloading'>>({});
  const [unloadingAll, setUnloadingAll] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [llamaManaged, setLlamaManaged] = useState<boolean | null>(null);

  const refreshModels = async (url?: string) => {
    setRefreshing(true);
    try {
      const list = await listAvailableModels(url ?? cfg.llmApiUrl);
      setModels(list);
      return list;
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    listAvailableModels(cfg.llmApiUrl).then(setModels).catch(() => {});
    if (isTauriApp()) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke<{ llama_running: boolean; llama_managed: boolean }>('get_service_status'))
        .then((st) => {
          if (st?.llama_running) setLlamaManaged(Boolean(st.llama_managed));
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runModelAction = async (
    modelId: string,
    mode: 'loading' | 'unloading',
    action: () => Promise<void>,
    successText: string,
    fallbackErr: string
  ) => {
    setActionFeedback(null);
    setBusyModels((prev) => ({ ...prev, [modelId]: mode }));
    try {
      await action();
      setActionFeedback({ kind: 'ok', text: successText });
    } catch (e) {
      setActionFeedback({ kind: 'err', text: e instanceof Error ? e.message : fallbackErr });
    } finally {
      setBusyModels((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      await refreshModels(cfg.llmApiUrl);
    }
  };

  const handleLoadModel = (modelId: string) =>
    runModelAction(
      modelId,
      'loading',
      () => loadRemoteModel(modelId, cfg.llmApiUrl),
      `已加载 ${modelId} 到显存`,
      `加载 ${modelId} 失败`
    );

  const handleUnloadModel = (modelId: string) =>
    runModelAction(
      modelId,
      'unloading',
      () => unloadRemoteModel(modelId, cfg.llmApiUrl),
      `已卸载 ${modelId}，显存已释放`,
      `卸载 ${modelId} 失败`
    );

  const handleUnloadAll = async () => {
    setActionFeedback(null);
    setUnloadingAll(true);
    try {
      const count = await unloadAllRemoteModels(cfg.llmApiUrl);
      setActionFeedback({
        kind: 'ok',
        text: count > 0 ? `已卸载全部 ${count} 个模型，显存已释放` : '当前没有已加载的模型',
      });
    } catch (e) {
      setActionFeedback({ kind: 'err', text: e instanceof Error ? e.message : '全部卸载失败' });
    } finally {
      setUnloadingAll(false);
      await refreshModels(cfg.llmApiUrl);
    }
  };

  const hasLoadingModel = useMemo(
    () => models.some((m) => m.status === 'loading'),
    [models]
  );

  useEffect(() => {
    if (!hasLoadingModel) return;
    const timer = window.setInterval(() => {
      listAvailableModels(cfg.llmApiUrl).then(setModels).catch(() => {});
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasLoadingModel, cfg.llmApiUrl]);

  const sortedModels = useMemo(() => {
    const topicTarget = cfg.topicModel.trim();
    const rank = (m: RemoteModelInfo) => {
      if (m.loaded || m.status === 'loading') return 0;
      if (m.id === cfg.llmModel || (topicTarget && m.id === topicTarget)) return 1;
      return 2;
    };
    return [...models].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  }, [models, cfg.llmModel, cfg.topicModel]);

  const loadedCount = useMemo(
    () => models.filter((m) => m.loaded || m.status === 'loading').length,
    [models]
  );

  const set = (patch: Partial<AppConfig>, autoSave = false) => {
    setCfg((c) => {
      const next = { ...c, ...patch };
      if (autoSave) {
        saveConfig(next);
        setSaved(true);
      } else {
        setSaved(false);
      }
      return next;
    });
    setTest('idle');
  };

  const runTest = async () => {
    setTest('testing');
    const ok = await checkLLMStatus(cfg.llmApiUrl);
    if (ok) await refreshModels(cfg.llmApiUrl);
    setTest(ok ? 'ok' : 'fail');
  };

  const mainOptions = useMemo(() => {
    const list = [...models];
    if (cfg.llmModel && !list.some((m) => m.id === cfg.llmModel)) {
      list.unshift({ id: cfg.llmModel, loaded: false });
    }
    return list;
  }, [models, cfg.llmModel]);

  const topicOptions = useMemo(() => {
    const list = [...models];
    if (cfg.topicModel && !list.some((m) => m.id === cfg.topicModel)) {
      list.unshift({ id: cfg.topicModel, loaded: false });
    }
    return list;
  }, [models, cfg.topicModel]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="主力模型（范文、点拨、批改、升格）" hint="切换下拉框即自动保存生效。">
          {(id) => (
            <select
              id={id}
              value={cfg.llmModel}
              onChange={(e) => set({ llmModel: e.target.value }, true)}
              className={`${INPUT_CLASS} font-mono text-sm font-bold`}
            >
              {mainOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}{m.loaded ? ' · 已加载' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="盲盒出题模型（极速出题）" hint="默认共用主力模型；也可单独指定轻量模型，切换即生效。">
          {(id) => (
            <select
              id={id}
              value={cfg.topicModel}
              onChange={(e) => set({ topicModel: e.target.value }, true)}
              className={`${INPUT_CLASS} font-mono text-sm font-bold`}
            >
              <option value="">共用主力模型（{cfg.llmModel}）</option>
              {topicOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}{m.loaded ? ' · 已加载' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-canvas px-4 py-2.5 text-sm text-ink-soft">
        <span>当前生效：</span>
        <Badge accent="brand">主力 · {cfg.llmModel}</Badge>
        <Badge accent="sun">出题 · {cfg.topicModel.trim() || cfg.llmModel}</Badge>
        {saved && <span className="ml-auto font-semibold text-mint-700">✓ 已保存并生效</span>}
      </div>

      <Field label="模型服务地址" hint="llama-server 的 OpenAI 兼容接口。默认 /api/llm/v1 会由开发服务器转发到本机 8080 端口；家里 PC 部署后可改成 http://电脑IP:8080/v1。">
        {(id) => <input id={id} value={cfg.llmApiUrl} onChange={(e) => set({ llmApiUrl: e.target.value })} className={`${INPUT_CLASS} font-mono text-sm`} />}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" icon={Wifi} loading={test === 'testing'} onClick={runTest}>
          {test === 'testing' ? '正在检测…' : '测试连接并刷新模型列表'}
        </Button>
        {test === 'ok' && <Badge accent="mint">连接成功，已同步 {models.length} 个模型</Badge>}
        {test === 'fail' && <Badge accent="coral">连不上，请确认 llama-server 已启动</Badge>}
      </div>

      {/* 本地显存与模型加载/卸载管理 */}
      <div className="rounded-2xl border border-line bg-canvas/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="size-4 text-brand-700" aria-hidden="true" />
            <span className="text-sm font-bold text-ink">模型加载与显存管理</span>
            <Badge accent={loadedCount > 0 ? 'mint' : 'sky'}>
              已加载 {loadedCount} 个
            </Badge>
            {llamaManaged !== null && (
              <span className="text-xs text-ink-mute">
                {llamaManaged ? '· 应用托管（退出自动释放显存）' : '· 外部服务（需手动卸载或关闭服务）'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => refreshModels(cfg.llmApiUrl)}
            >
              刷新
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={PowerOff}
              loading={unloadingAll}
              disabled={loadedCount === 0 || refreshing}
              onClick={handleUnloadAll}
            >
              {unloadingAll ? '卸载中…' : '全部卸载'}
            </Button>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-ink-mute">
          启动应用时会自动预加载当前配置的「主力 / 出题」模型；Router 默认最多同时常驻 2 个模型，切换对比多个大模型或释放显卡显存时，可在此直接单独「加载」或「卸载」。
        </p>

        {actionFeedback && (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
              actionFeedback.kind === 'ok'
                ? 'bg-mint-50 text-mint-700 border border-mint-100'
                : 'bg-coral-50 text-coral-700 border border-coral-100'
            }`}
          >
            {actionFeedback.kind === 'ok' ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
        )}

        {sortedModels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white/70 px-4 py-3 text-xs text-ink-mute">
            暂未检测到可管理的模型列表，请确认本地 `llama-server` 已运行后点击「刷新」。
          </div>
        ) : (
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {sortedModels.map((m) => {
              const busy = busyModels[m.id];
              const isLoaded = m.loaded || m.status === 'loaded';
              const isLoading = m.status === 'loading';
              const isFailed = m.status === 'failed';
              const isMain = m.id === cfg.llmModel;
              const isTopic = cfg.topicModel.trim() === m.id;

              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-bold text-ink sm:text-sm" title={m.id}>
                      {m.id}
                    </span>
                    {isMain && <Badge accent="brand">主力</Badge>}
                    {isTopic && <Badge accent="sun">出题</Badge>}
                    {isLoaded ? (
                      <Badge accent="mint">已加载</Badge>
                    ) : isLoading ? (
                      <Badge accent="sun">加载中…</Badge>
                    ) : isFailed ? (
                      <Badge accent="coral">加载失败</Badge>
                    ) : (
                      <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-mute">
                        未加载
                      </span>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isLoaded || isLoading ? (
                      <Button
                        size="sm"
                        variant="danger"
                        icon={PowerOff}
                        loading={busy === 'unloading'}
                        disabled={Boolean(busy) || unloadingAll}
                        onClick={() => handleUnloadModel(m.id)}
                      >
                        {busy === 'unloading' ? '卸载中…' : '卸载'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="soft"
                        icon={Play}
                        loading={busy === 'loading'}
                        disabled={Boolean(busy) || unloadingAll}
                        onClick={() => handleLoadModel(m.id)}
                      >
                        {busy === 'loading' ? '加载中…' : '加载'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <details className="rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-base font-bold text-ink">高级：独立出题地址、语音识别与云同步（选填）</summary>
        <div className="mt-4 space-y-4">
          <Field
            label="独立出题模型服务地址（选填）"
            hint="留空则共用上面的模型服务地址。只有单独起了另一个 llama-server 端口时才需填写。"
          >
            {(id) => (
              <input
                id={id}
                value={cfg.topicApiUrl}
                onChange={(e) => set({ topicApiUrl: e.target.value })}
                placeholder={`默认共用：${cfg.llmApiUrl}`}
                className={`${INPUT_CLASS} font-mono text-sm`}
              />
            )}
          </Field>
          <Field label="语音识别接口（ASR）" hint="不填则使用浏览器自带的语音输入。">
            {(id) => <input id={id} value={cfg.asrApiUrl} onChange={(e) => set({ asrApiUrl: e.target.value })} className={`${INPUT_CLASS} font-mono text-sm`} />}
          </Field>
          <Field label="Supabase 项目地址">
            {(id) => <input id={id} value={cfg.supabaseUrl} onChange={(e) => set({ supabaseUrl: e.target.value })} className={`${INPUT_CLASS} font-mono text-sm`} />}
          </Field>
          <Field label="Supabase Anon Key">
            {(id) => <input id={id} type="password" value={cfg.supabaseAnonKey} onChange={(e) => set({ supabaseAnonKey: e.target.value })} className={`${INPUT_CLASS} font-mono text-sm`} />}
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button
          icon={Save}
          onClick={() => {
            saveConfig(cfg);
            setSaved(true);
          }}
        >
          保存
        </Button>
        {saved && (
          <span role="status" className="text-sm font-semibold text-mint-700">
            已保存
          </span>
        )}
        <p className="text-sm text-ink-mute">配置只保存在这台电脑的浏览器里，不会上传。</p>
      </div>
    </div>
  );
};

/* ───────────────────────────── 年级与评分 ───────────────────────────── */

interface GradeForm {
  teacherRole: string;
  defaultWordCount: number;
  paragraphHint: string;
  focusText: string;
  genres: string[];
  voice: string;
  requirements: string;
  rubric: GradeProfile['rubric'];
}

const toForm = (p: GradeProfile): GradeForm => ({
  teacherRole: p.teacherRole,
  defaultWordCount: p.defaultWordCount,
  paragraphHint: p.paragraphHint,
  focusText: p.focus.join('\n'),
  genres: p.genres,
  voice: p.voice,
  requirements: p.requirements,
  rubric: JSON.parse(JSON.stringify(p.rubric)),
});

/** 只把与内置默认不同的字段存下来 */
function diffToPatch(base: GradeProfile, f: GradeForm) {
  const patch: Record<string, unknown> = {};
  const focus = f.focusText.split('\n').map((s) => s.trim()).filter(Boolean);
  if (f.teacherRole !== base.teacherRole) patch.teacherRole = f.teacherRole;
  if (f.defaultWordCount !== base.defaultWordCount) patch.defaultWordCount = f.defaultWordCount;
  if (f.paragraphHint !== base.paragraphHint) patch.paragraphHint = f.paragraphHint;
  if (JSON.stringify(focus) !== JSON.stringify(base.focus)) patch.focus = focus;
  if (JSON.stringify(f.genres) !== JSON.stringify(base.genres)) patch.genres = f.genres;
  if (f.voice !== base.voice) patch.voice = f.voice;
  if (f.requirements !== base.requirements) patch.requirements = f.requirements;
  const rubric: Record<string, unknown> = {};
  for (const k of ['structure', 'wording', 'emotion'] as const) {
    if (JSON.stringify(f.rubric[k]) !== JSON.stringify(base.rubric[k])) rubric[k] = f.rubric[k];
  }
  if (Object.keys(rubric).length) patch.rubric = rubric;
  return Object.keys(patch).length ? patch : null;
}

const GradeTab: React.FC<{ initial: GradeLevel }> = ({ initial }) => {
  const version = useLibraryVersion();
  const [grade, setGrade] = useState<GradeLevel>(initial);
  const profile = useMemo(() => getGradeProfile(grade), [grade, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState<GradeForm>(() => toForm(profile));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(toForm(profile));
  }, [profile]);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(profile));
  const set = (patch: Partial<GradeForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };
  const total = form.rubric.structure.max + form.rubric.wording.max + form.rubric.emotion.max;
  const allGenres = listGenres();

  const save = () => {
    const patch = diffToPatch(DEFAULT_GRADE_PROFILES[grade], form);
    if (patch) saveGradeProfile(grade, patch);
    else resetGradeProfile(grade);
    setSaved(true);
  };

  return (
    <div className="space-y-5">
      <Field label="选择年级" hint="每个年级一份“画像”：字数、训练重点、语气和评分标准。提示词模板会自动引用它。">
        {(id) => <GradeSelect id={id} value={grade} onChange={setGrade} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="默认字数">
          {(id) => (
            <input id={id} type="number" min={100} max={1500} step={50} value={form.defaultWordCount} onChange={(e) => set({ defaultWordCount: Number(e.target.value) })} className={INPUT_CLASS} />
          )}
        </Field>
        <Field label="段落建议">
          {(id) => <input id={id} value={form.paragraphHint} onChange={(e) => set({ paragraphHint: e.target.value })} className={INPUT_CLASS} />}
        </Field>
        <Field label="老师称谓">
          {(id) => <input id={id} value={form.teacherRole} onChange={(e) => set({ teacherRole: e.target.value })} className={INPUT_CLASS} />}
        </Field>
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-semibold text-ink">可选体裁</p>
        <div role="group" aria-label="可选体裁" className="flex flex-wrap gap-2">
          {allGenres.map((g) => {
            const on = form.genres.includes(g);
            return (
              <label
                key={g}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-base font-semibold ${
                  on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line text-ink-soft hover:bg-canvas'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  className="size-4 accent-brand-600"
                  onChange={() => set({ genres: on ? form.genres.filter((x) => x !== g) : allGenres.filter((x) => x === g || form.genres.includes(x)) })}
                />
                {g}
              </label>
            );
          })}
        </div>
        {form.genres.length === 0 && <p className="text-sm text-coral-700">至少选一个体裁。</p>}
      </div>

      <Field label="本年级训练重点（每行一条）">
        {(id) => <textarea id={id} rows={4} value={form.focusText} onChange={(e) => set({ focusText: e.target.value })} className={TEXTAREA} />}
      </Field>
      <Field label="老师说话的风格">
        {(id) => <textarea id={id} rows={3} value={form.voice} onChange={(e) => set({ voice: e.target.value })} className={TEXTAREA} />}
      </Field>
      <Field label="写作要求（会写进范文和升格的提示词）">
        {(id) => <textarea id={id} rows={4} value={form.requirements} onChange={(e) => set({ requirements: e.target.value })} className={TEXTAREA} />}
      </Field>

      <Card className="space-y-3 bg-canvas! shadow-none!">
        <p className="text-base font-bold text-ink">
          评分标准 <span className="font-medium text-ink-soft">（满分合计 {total} 分）</span>
        </p>
        {(['structure', 'wording', 'emotion'] as const).map((k) => (
          <div key={k} className="grid gap-2 sm:grid-cols-[8rem_5rem_1fr]">
            <input
              aria-label="维度名称"
              value={form.rubric[k].label}
              onChange={(e) => set({ rubric: { ...form.rubric, [k]: { ...form.rubric[k], label: e.target.value } } })}
              className={INPUT_CLASS}
            />
            <input
              aria-label="满分"
              type="number"
              min={1}
              max={100}
              value={form.rubric[k].max}
              onChange={(e) => set({ rubric: { ...form.rubric, [k]: { ...form.rubric[k], max: Number(e.target.value) } } })}
              className={INPUT_CLASS}
            />
            <input
              aria-label="维度说明"
              value={form.rubric[k].desc}
              onChange={(e) => set({ rubric: { ...form.rubric, [k]: { ...form.rubric[k], desc: e.target.value } } })}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </Card>

      <SaveBar
        dirty={dirty && form.genres.length > 0}
        modified={isGradeModified(grade)}
        saved={saved}
        onSave={save}
        onReset={() => {
          resetGradeProfile(grade);
          setSaved(false);
        }}
        resetLabel="恢复本年级默认"
      />
    </div>
  );
};

/* ───────────────────────────── 体裁库 ───────────────────────────── */

const GenreTab: React.FC = () => {
  const version = useLibraryVersion();
  const genres = listGenres();
  const [genre, setGenre] = useState(genres[0]);
  const current = useMemo(() => getGenreGuide(genre), [genre, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [guide, setGuide] = useState(current.guide);
  const [dirs, setDirs] = useState(current.questionDirections);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setGuide(current.guide);
    setDirs(current.questionDirections);
  }, [current]);

  const dirty = guide !== current.guide || dirs !== current.questionDirections;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-ink">选择体裁</p>
        <Segmented
          value={genre}
          onChange={(g) => {
            setGenre(g);
            setSaved(false);
          }}
          options={genres.map((g) => ({ value: g, label: isGenreModified(g) ? `${g} ·` : g }))}
          label="体裁"
          size="sm"
        />
      </div>
      <Field label="这种体裁怎么写（范文、升格、批改都会引用）">
        {(id) => <textarea id={id} rows={4} value={guide} onChange={(e) => { setGuide(e.target.value); setSaved(false); }} className={TEXTAREA} />}
      </Field>
      <Field label="“想一想”里，老师往哪些方向追问" hint="用顿号隔开，例如：心理、动作、神态">
        {(id) => <input id={id} value={dirs} onChange={(e) => { setDirs(e.target.value); setSaved(false); }} className={INPUT_CLASS} />}
      </Field>
      <SaveBar
        dirty={dirty}
        modified={isGenreModified(genre)}
        saved={saved}
        onSave={() => {
          const base = DEFAULT_GENRE_GUIDES[genre];
          const patch: Record<string, string> = {};
          if (guide !== base.guide) patch.guide = guide;
          if (dirs !== base.questionDirections) patch.questionDirections = dirs;
          if (Object.keys(patch).length) saveGenreGuide(genre, patch);
          else resetGenreGuide(genre);
          setSaved(true);
        }}
        onReset={() => {
          resetGenreGuide(genre);
          setSaved(false);
        }}
      />
    </div>
  );
};

/* ───────────────────────────── 提示词库 ───────────────────────────── */

const GROUPS = ['通用', '想一想', '写一写', '改一改', '学一学'] as const;

const PromptTab: React.FC<{ gradeId: GradeLevel }> = ({ gradeId }) => {
  const version = useLibraryVersion();
  const [taskId, setTaskId] = useState<PromptTaskId>('persona');
  const task = DEFAULT_PROMPT_TASKS.find((t) => t.id === taskId)!;
  const saved = useMemo(() => getPromptTemplate(taskId), [taskId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);
  const [previewGrade, setPreviewGrade] = useState<GradeLevel>(gradeId);
  const previewProfile = getGradeProfile(previewGrade);
  const [previewGenre, setPreviewGenre] = useState(previewProfile.genres[0]);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(saved), [saved]);
  useEffect(() => {
    if (!previewProfile.genres.includes(previewGenre)) setPreviewGenre(previewProfile.genres[0]);
  }, [previewProfile, previewGenre]);

  const dirty = text !== saved;
  const unknown = Array.from(new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))).filter(
    (v) => !(v in PROMPT_VARIABLES)
  );

  const insertVar = (name: string) => {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText((t) => t + token);
    const { selectionStart: s, selectionEnd: e } = el;
    setText(text.slice(0, s) + token + text.slice(e));
    setJustSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };

  const preview = useMemo(
    () => renderTask(taskId, previewProfile, previewGenre, undefined, text),
    [taskId, previewProfile, previewGenre, text, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
      {/* 任务列表 */}
      <nav aria-label="提示词任务" className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g} className="space-y-1">
            <p className="px-2 text-sm font-bold text-ink-mute">{g}</p>
            {DEFAULT_PROMPT_TASKS.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={t.id === taskId ? 'true' : undefined}
                onClick={() => {
                  setTaskId(t.id);
                  setJustSaved(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-base font-semibold ${
                  t.id === taskId ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-canvas'
                }`}
              >
                {t.name}
                {isPromptModified(t.id) && <span className="size-2 rounded-full bg-sun-500" title="已自定义" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* 编辑区 */}
      <div className="min-w-0 space-y-4">
        <div>
          <h3 className="text-lg font-extrabold text-ink">{task.name}</h3>
          <p className="text-sm text-ink-soft">{task.description}</p>
        </div>

        <Field label="提示词模板">
          {(id) => (
            <textarea
              id={id}
              ref={area}
              rows={14}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setJustSaved(false);
              }}
              className={`${INPUT_CLASS} resize-y font-mono text-sm leading-relaxed`}
              spellCheck={false}
            />
          )}
        </Field>

        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">点一下插入变量</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PROMPT_VARIABLES).map(([name, desc]) => (
              <button
                key={name}
                type="button"
                title={desc}
                onClick={() => insertVar(name)}
                className="rounded-lg border border-brand-100 bg-brand-50 px-2 py-1 font-mono text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                {`{{${name}}}`}
              </button>
            ))}
          </div>
        </div>

        {unknown.length > 0 && (
          <Banner tone="error" title="有变量名写错了">
            这些变量不存在，不会被替换：{unknown.map((u) => `{{${u}}}`).join('、')}
          </Banner>
        )}

        <SaveBar
          dirty={dirty}
          modified={isPromptModified(taskId)}
          saved={justSaved}
          onSave={() => {
            savePromptTemplate(taskId, text);
            setJustSaved(true);
          }}
          onReset={() => {
            resetPromptTemplate(taskId);
            setJustSaved(false);
          }}
        />

        {/* 预览 */}
        <section className="space-y-2 rounded-2xl bg-canvas p-4" aria-label="实际发给模型的提示词预览">
          <div className="flex flex-wrap items-end gap-3">
            <p className="mr-auto text-base font-bold text-ink">预览：实际发给 AI 的内容</p>
            <label className="text-sm font-semibold text-ink-soft">
              年级
              <select
                value={previewGrade}
                onChange={(e) => setPreviewGrade(e.target.value as GradeLevel)}
                className="ml-2 rounded-lg border-2 border-line bg-white px-2 py-1 text-sm"
              >
                {GRADE_ORDER.map((g) => (
                  <option key={g} value={g}>
                    {getGradeProfile(g).name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-ink-soft">
              体裁
              <select
                value={previewGenre}
                onChange={(e) => setPreviewGenre(e.target.value)}
                className="ml-2 rounded-lg border-2 border-line bg-white px-2 py-1 text-sm"
              >
                {previewProfile.genres.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl bg-white p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-soft slim-scroll">
            {preview}
          </pre>
        </section>
      </div>
    </div>
  );
};

/* ───────────────────────────── 数据 ───────────────────────────── */

const DataTab: React.FC = () => {
  const version = useLibraryVersion();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modified = useMemo(() => hasAnyModification(), [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const blob = new Blob([exportLibrary()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `作文助手-提示词库-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({ tone: 'success', text: '已导出。可以把这个文件拷到家里的 Windows 电脑上导入。' });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importLibrary(await file.text());
      setMsg({ tone: 'success', text: '导入成功，已经生效。' });
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message || '导入失败' });
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      <p className="text-base leading-relaxed text-ink-soft">
        软件内置了三年级到高三的年级画像、体裁库和提示词库。你在这里做的修改只保存在这台电脑上，
        没改过的部分以后升级软件会自动更新。换电脑时可以先导出、再导入。
      </p>

      <div className="flex flex-wrap gap-3">
        <Button icon={Download} onClick={download} disabled={!modified}>
          导出我的修改
        </Button>
        <Button variant="soft" icon={FileUp} onClick={() => fileRef.current?.click()}>
          导入
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
      </div>
      {!modified && <p className="text-sm text-ink-mute">目前没有任何自定义修改，所以不需要导出。</p>}

      {msg && <Banner tone={msg.tone} title={msg.text} />}

      <div className="border-t border-line pt-4">
        <Button
          variant={confirmReset ? 'danger' : 'ghost'}
          icon={RotateCcw}
          disabled={!modified}
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              window.setTimeout(() => setConfirmReset(false), 3000);
              return;
            }
            resetAllLibrary();
            setConfirmReset(false);
            setMsg({ tone: 'success', text: '已全部恢复为内置默认。' });
          }}
        >
          {confirmReset ? '再点一次，确认全部恢复默认' : '全部恢复为内置默认'}
        </Button>
      </div>
    </div>
  );
};

/* ───────────────────────────── 关于与更新 ───────────────────────────── */

const AboutTab: React.FC = () => {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatusText, setUpdateStatusText] = useState('');
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);

  const platform = getClientPlatform();

  const handleCheck = async () => {
    setChecking(true);
    setHasChecked(false);
    setError(null);
    setUpdateActionError(null);
    try {
      const info = await checkForAppUpdates();
      setUpdateInfo(info);
      setHasChecked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '检查更新失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  const handleStartUpdate = async () => {
    setUpdating(true);
    setUpdateActionError(null);
    setUpdateProgress(0);
    setUpdateStatusText('准备开始自动更新…');

    try {
      if (isTauriApp()) {
        await performInAppUpdate((pct, text) => {
          setUpdateProgress(pct);
          setUpdateStatusText(text);
        });
      } else {
        const fallbackUrl =
          platform === 'mac'
            ? updateInfo?.macDownloadUrl || updateInfo?.htmlUrl
            : updateInfo?.windowsDownloadUrl || updateInfo?.htmlUrl;
        if (fallbackUrl) openExternalUrl(fallbackUrl);
        setUpdating(false);
      }
    } catch (err) {
      console.error('自动更新失败:', err);
      setUpdateActionError(err instanceof Error ? err.message : '自动更新未能完成');
      setUpdating(false);
    }
  };

  const fallbackDownloadUrl =
    platform === 'mac'
      ? updateInfo?.macDownloadUrl || updateInfo?.htmlUrl
      : updateInfo?.windowsDownloadUrl || updateInfo?.htmlUrl;

  return (
    <div className="space-y-6">
      {/* 头部介绍卡片 */}
      <div className="flex flex-col sm:flex-row items-center gap-5 rounded-3xl bg-canvas p-6 border border-line">
        <Mascot mood="cheer" size={80} />
        <div className="flex-1 text-center sm:text-left space-y-1.5">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <h3 className="text-xl font-extrabold text-ink tracking-tight">作文大师</h3>
            <span className="rounded-full bg-brand-100 px-3 py-0.5 text-xs font-bold text-brand-800">
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-sm text-ink-soft">
            专为中小学生打造的 AI 写作导师 · 本地大模型驱动 · 100% 隐私安全
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <Button
              icon={RefreshCw}
              disabled={checking || updating}
              onClick={handleCheck}
            >
              {checking ? '正在检查最新版本…' : '检查新版本'}
            </Button>
            <Button
              variant="ghost"
              icon={ExternalLink}
              onClick={() => openExternalUrl(`https://github.com/${GITHUB_REPO}`)}
            >
              GitHub 开源仓库
            </Button>
          </div>
        </div>
      </div>

      {/* 检查结果反馈 */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl bg-coral-50 p-4 border border-coral-200 text-coral-800 text-sm">
          <AlertCircle className="size-5 shrink-0 text-coral-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">检查更新时遇到问题</p>
            <p className="mt-0.5 text-xs text-coral-700">{error}</p>
          </div>
          <Button variant="ghost" onClick={handleCheck}>
            重试
          </Button>
        </div>
      )}

      {hasChecked && updateInfo && (
        <>
          {updateInfo.hasUpdate ? (
            <div className="rounded-3xl border-2 border-brand-300 bg-brand-50/50 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-xl bg-brand-600 text-white">
                    <Sparkles className="size-4.5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-ink text-base">
                      发现新版本 v{updateInfo.latestVersion}！
                    </h4>
                    <p className="text-xs text-ink-mute">
                      发布于 {updateInfo.publishedAt || '最近'} · 当前运行 v{updateInfo.currentVersion}
                    </p>
                  </div>
                </div>

                {!updating && (
                  <div className="flex items-center gap-2">
                    <Button
                      icon={RefreshCw}
                      onClick={handleStartUpdate}
                    >
                      立即自动更新
                    </Button>
                    <Button
                      variant="soft"
                      icon={ExternalLink}
                      onClick={() => openExternalUrl(updateInfo.htmlUrl)}
                    >
                      查看 Release
                    </Button>
                  </div>
                )}
              </div>

              {/* 更新中进度条卡片 */}
              {updating && (
                <div className="rounded-2xl border border-brand-200 bg-white p-4 space-y-2.5 anim-fade-up">
                  <div className="flex items-center justify-between text-sm font-bold text-ink">
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin text-brand-600" />
                      {updateStatusText || '正在自动就地更新…'}
                    </span>
                    <span className="text-brand-700">{updateProgress}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
                    <div
                      className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.max(4, updateProgress)}%` }}
                    />
                  </div>
                  <p className="text-xs text-ink-mute">
                    更新完成后应用将自动重启，无需手动干预。
                  </p>
                </div>
              )}

              {/* 更新异常 */}
              {updateActionError && (
                <div className="rounded-2xl border border-coral-200 bg-coral-50 p-3 text-xs text-coral-800 flex items-center justify-between gap-2">
                  <span>自动更新提示: {updateActionError}</span>
                  {fallbackDownloadUrl && (
                    <Button size="sm" variant="ghost" onClick={() => openExternalUrl(fallbackDownloadUrl)}>
                      备用：打开下载
                    </Button>
                  )}
                </div>
              )}

              {/* 更新日志 */}
              <div className="rounded-2xl border border-brand-200/60 bg-white p-3.5">
                <p className="text-xs font-bold text-ink-mute mb-1">更新日志：</p>
                <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {updateInfo.releaseNotes}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-mint-50 p-4 border border-mint-200 text-mint-900 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-mint-600" />
              <div>
                <p className="font-bold">当前已是最新版本 (v{APP_VERSION})</p>
                <p className="mt-0.5 text-xs text-mint-700">
                  没有检测到待更新的程序，你可以放心使用所有最新功能与题库。
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* 核心特性与技术架构 */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-ink">系统与技术架构</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-line bg-canvas/60 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-sm">
              <Cpu className="size-4.5" />
              <span>本地 Qwen 大模型</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              通过 llama.cpp 直接调用显卡或芯片本地推理，断网可用，所有写作数据与批改仅保留在本地。
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-canvas/60 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-sm">
              <Mic className="size-4.5" />
              <span>阿里 SenseVoice ASR</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              集成阿里达摩院 SenseVoice 本地极速语音转写，孩子开口说话 0.2 秒实时上屏，顺畅无阻。
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-canvas/60 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-brand-700 font-bold text-sm">
              <Laptop className="size-4.5" />
              <span>跨平台 Tauri 架构</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              基于 Rust + Tauri 2.0，同时支持 macOS 与 Windows 原生极速运行，云端 GitHub 自动化构建分发。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────────── 家长区弹窗 ───────────────────────────── */

export const ParentZone: React.FC<ParentZoneProps> = ({ open, onClose, currentGrade, initialTab = 'model' }) => {
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (open && initialTab) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="家长区"
      description="模型连接、年级画像、体裁与提示词库都在这里管理，孩子不需要碰。"
      maxWidth="60rem"
      icon={<ShieldCheck className="mt-0.5 size-6 text-brand-600" aria-hidden="true" />}
    >
      <div className="space-y-5">
        <Tabs
          label="家长区分类"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'model', label: '模型连接' },
            { value: 'grade', label: '年级与评分' },
            { value: 'genre', label: '体裁库' },
            { value: 'prompt', label: '提示词库' },
            { value: 'data', label: '数据' },
            { value: 'about', label: '关于与更新' },
          ]}
        />
        <div role="tabpanel" aria-label="家长区内容" className="min-h-[30rem]">
          {tab === 'model' && <ModelTab />}
          {tab === 'grade' && <GradeTab initial={currentGrade} />}
          {tab === 'genre' && <GenreTab />}
          {tab === 'prompt' && <PromptTab gradeId={currentGrade} />}
          {tab === 'data' && <DataTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </Dialog>
  );
};
