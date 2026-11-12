/**
 * 年级画像 / 文体 / 提示词 的本地覆盖层。
 * 内置默认值写在 src/data 下；家长区的修改只保存“与默认不同的部分”，
 * 因此以后升级内置库时，没改过的条目会自动跟着更新。
 */
import { useMemo, useSyncExternalStore } from 'react';
import {
  DEFAULT_GRADE_PROFILES,
  type GradeLevel,
  type GradeProfile,
  type Rubric,
} from '../data/gradeProfiles';
import { DEFAULT_GENRE_GUIDES, FALLBACK_GENRE_GUIDE, type GenreGuide } from '../data/genres';
import { DEFAULT_PROMPT_BY_ID, DEFAULT_PROMPT_TASKS, type PromptTaskId } from '../data/promptTemplates';

const STORAGE_KEY = 'writing_master_library_v1';

type RubricPatch = { [K in keyof Rubric]?: Partial<Rubric[K]> };
type GradePatch = Partial<Omit<GradeProfile, 'rubric' | 'id'>> & { rubric?: RubricPatch };

interface Overrides {
  version: 1;
  grades: Partial<Record<GradeLevel, GradePatch>>;
  prompts: Partial<Record<PromptTaskId, string>>;
  genres: Record<string, Partial<GenreGuide>>;
}

const emptyOverrides = (): Overrides => ({ version: 1, grades: {}, prompts: {}, genres: {} });

// ───────────────────────────── 读写与订阅 ─────────────────────────────

function load(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        version: 1,
        grades: parsed.grades ?? {},
        prompts: parsed.prompts ?? {},
        genres: parsed.genres ?? {},
      };
    }
  } catch (e) {
    console.warn('读取提示词库覆盖配置失败，使用内置默认', e);
  }
  return emptyOverrides();
}

let overrides: Overrides = load();
let version = 0;
const listeners = new Set<() => void>();

function commit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('保存提示词库失败', e);
  }
  version += 1;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ───────────────────────────── 年级画像 ─────────────────────────────

export function getGradeProfile(id: GradeLevel): GradeProfile {
  const base = DEFAULT_GRADE_PROFILES[id];
  const patch = overrides.grades[id];
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    id,
    rubric: {
      structure: { ...base.rubric.structure, ...patch.rubric?.structure },
      wording: { ...base.rubric.wording, ...patch.rubric?.wording },
      emotion: { ...base.rubric.emotion, ...patch.rubric?.emotion },
    },
  };
}

export const isGradeModified = (id: GradeLevel) => !!overrides.grades[id];

export function saveGradeProfile(id: GradeLevel, patch: GradePatch) {
  overrides.grades = { ...overrides.grades, [id]: patch };
  commit();
}

export function resetGradeProfile(id: GradeLevel) {
  const next = { ...overrides.grades };
  delete next[id];
  overrides.grades = next;
  commit();
}

// ───────────────────────────── 文体 ─────────────────────────────

export function getGenreGuide(genre: string): GenreGuide {
  const base = DEFAULT_GENRE_GUIDES[genre] ?? FALLBACK_GENRE_GUIDE;
  return { ...base, ...overrides.genres[genre] };
}

export const listGenres = () => Object.keys(DEFAULT_GENRE_GUIDES);
export const isGenreModified = (genre: string) => !!overrides.genres[genre];

export function saveGenreGuide(genre: string, patch: Partial<GenreGuide>) {
  overrides.genres = { ...overrides.genres, [genre]: patch };
  commit();
}

export function resetGenreGuide(genre: string) {
  const next = { ...overrides.genres };
  delete next[genre];
  overrides.genres = next;
  commit();
}

// ───────────────────────────── 提示词模板 ─────────────────────────────

export const getPromptTemplate = (id: PromptTaskId): string =>
  overrides.prompts[id] ?? DEFAULT_PROMPT_BY_ID[id].template;

export const isPromptModified = (id: PromptTaskId) =>
  overrides.prompts[id] !== undefined && overrides.prompts[id] !== DEFAULT_PROMPT_BY_ID[id].template;

export function savePromptTemplate(id: PromptTaskId, template: string) {
  const next = { ...overrides.prompts };
  if (template === DEFAULT_PROMPT_BY_ID[id].template) delete next[id];
  else next[id] = template;
  overrides.prompts = next;
  commit();
}

export function resetPromptTemplate(id: PromptTaskId) {
  const next = { ...overrides.prompts };
  delete next[id];
  overrides.prompts = next;
  commit();
}

// ───────────────────────────── 整库操作 ─────────────────────────────

export function resetAllLibrary() {
  overrides = emptyOverrides();
  commit();
}

export const hasAnyModification = () =>
  Object.keys(overrides.grades).length > 0 ||
  Object.keys(overrides.prompts).length > 0 ||
  Object.keys(overrides.genres).length > 0;

export function exportLibrary(): string {
  return JSON.stringify(
    { app: 'writing-master', kind: 'library', exportedAt: new Date().toISOString(), ...overrides },
    null,
    2
  );
}

/** 导入库配置；格式不对会抛出带中文原因的错误 */
export function importLibrary(text: string) {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON，请选择从本软件导出的库文件。');
  }
  if (data?.app !== 'writing-master' || data?.kind !== 'library') {
    throw new Error('这不是本软件导出的库文件。');
  }
  const validPromptIds = new Set(DEFAULT_PROMPT_TASKS.map((t) => t.id as string));
  const prompts: Overrides['prompts'] = {};
  for (const [k, v] of Object.entries(data.prompts ?? {})) {
    if (validPromptIds.has(k) && typeof v === 'string') prompts[k as PromptTaskId] = v;
  }
  const grades: Overrides['grades'] = {};
  for (const [k, v] of Object.entries(data.grades ?? {})) {
    if (k in DEFAULT_GRADE_PROFILES && v && typeof v === 'object') grades[k as GradeLevel] = v as GradePatch;
  }
  overrides = { version: 1, grades, prompts, genres: data.genres ?? {} };
  commit();
}

// ───────────────────────────── React Hooks ─────────────────────────────

/** 订阅库变化：返回一个会随修改自增的版本号，用于触发重渲染 */
export const useLibraryVersion = () =>
  useSyncExternalStore(subscribe, () => version, () => version);

export function useGradeProfile(id: GradeLevel): GradeProfile {
  const v = useLibraryVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getGradeProfile(id), [id, v]);
}

