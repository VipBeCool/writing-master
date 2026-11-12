/**
 * 作文训练助手 · AI 服务层
 * 直连本地 llama.cpp 的 llama-server（OpenAI 兼容接口），不依赖 Dify。
 */
import { DEFAULT_MAIN_MODEL, isUnsupportedModelId, loadConfig, saveConfig } from './configService';
import type { CorrectionReport, IdeaTrainingSession } from '../types';
import type { GradeProfile } from '../data/gradeProfiles';
import type { TopicCard } from '../data/topics';
import { pickAngle, pickLengthStyle } from '../data/topicStyles';
import { getTopicHistory } from './topicHistoryStore';
import { analyzeEssayCompleteness } from '../utils/text';
import {
  type ChatMessage,
  COMPARE_SCHEMA,
  GOLDEN_SENTENCES_SCHEMA,
  IDEA_FEEDBACK_SCHEMA,
  buildCompareMessages,
  buildDiagnoseMessages,
  buildDiagnoseSchema,
  buildExpandShortEssayMessages,
  buildGoldenSentenceMessages,
  buildHintMessages,
  buildIdeaDraftMessages,
  buildIdeaFeedbackMessages,
  buildReviseMessages,
  buildSampleEssayMessages,
  buildTopicGenMessages,
  buildTopicGenSchema,
  buildUpgradeMessages,
  countChars,
} from './prompts';

export { countChars } from './prompts';

export class LLMError extends Error {}

const NOT_RUNNING_HINT =
  '连不上本地模型服务，请先启动 llama-server（默认端口 8080），或在右上角“设置”中检查模型服务地址。';

// ───────────────────────────── 底层调用 ─────────────────────────────

type EndpointKind = 'main' | 'topic';

/**
 * 规范化 API 地址：
 * 如果在 Tauri 桌面端运行或打包模式下，当地址为相对路径（如默认的 `/api/llm/v1`），
 * 自动转为直连本地服务的绝对路径 `http://127.0.0.1:8080/v1`。
 */
export function normalizeApiUrl(url: string): string {
  let base = url.trim().replace(/\/+$/, '');
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window ||
      window.location.protocol === 'tauri:' ||
      window.location.protocol === 'asset:');

  if (base.startsWith('/') && (isTauri || import.meta.env.PROD)) {
    base = 'http://127.0.0.1:8080' + base.replace(/^\/api\/llm/, '');
  }
  return base;
}

function resolveEndpoint(kind: EndpointKind = 'main'): { baseUrl: string; model: string } {
  const cfg = loadConfig();
  if (kind === 'topic') {
    const rawUrl = cfg.topicApiUrl.trim() || cfg.llmApiUrl;
    return {
      baseUrl: normalizeApiUrl(rawUrl),
      model: cfg.topicModel.trim() || cfg.llmModel,
    };
  }
  return {
    baseUrl: normalizeApiUrl(cfg.llmApiUrl),
    model: cfg.llmModel,
  };
}

async function post(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  endpoint: EndpointKind = 'main'
): Promise<Response> {
  const { baseUrl, model } = resolveEndpoint(endpoint);
  const sendWithModel = async (targetModel: string) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        // 关闭 Qwen3.5 的“思考模式”：直接输出正文，省时间也省 token
        chat_template_kwargs: { enable_thinking: false },
        ...body,
      }),
      signal,
    });

  let res: Response;
  try {
    res = await sendWithModel(model);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LLMError(NOT_RUNNING_HINT);
  }

  if (!res.ok) {
    // 代理在后端不可达时会返回 502/504
    if (res.status === 502 || res.status === 504) throw new LLMError(NOT_RUNNING_HINT);
    let detail = `模型服务返回错误 HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err?.error?.message || err?.message || detail;
    } catch {
      // ignore
    }

    // 若选中的模型因 llama.cpp 不支持该架构而报错 failed to load，自动回退到主力 Qwen3.5-4B 模型并重试一次
    if (/failed to load/i.test(detail) && model !== DEFAULT_MAIN_MODEL) {
      const cfg = loadConfig();
      saveConfig({
        ...cfg,
        llmModel: cfg.llmModel === model ? DEFAULT_MAIN_MODEL : cfg.llmModel,
        topicModel: cfg.topicModel === model ? '' : cfg.topicModel,
      });
      try {
        const retryRes = await sendWithModel(DEFAULT_MAIN_MODEL);
        if (retryRes.ok) return retryRes;
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
      throw new LLMError(
        `模型 ${model} 当前无法被本机 llama-server 加载（架构不支持），已自动为你切换回 ${DEFAULT_MAIN_MODEL}，请再点一次即可。`
      );
    }

    throw new LLMError(detail);
  }
  return res;
}

/** 流式生成纯文本（打字机效果）。onText 每收到一段就回调累计文本 */
export async function chatStream(opts: {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onText?: (accumulated: string) => void;
}): Promise<string> {
  const res = await post(
    {
      messages: opts.messages,
      stream: true,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
      top_p: 0.8,
      top_k: 20,
      presence_penalty: 1.0,
    },
    opts.signal
  );

  if (!res.body) throw new LLMError('当前环境不支持流式读取响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            opts.onText?.(accumulated);
          }
        } catch {
          // 忽略非 JSON 的心跳帧
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

/** 生成结构化 JSON（用 JSON Schema 约束输出，保证字段齐全、格式合法） */
export async function chatJSON<T>(opts: {
  messages: ChatMessage[];
  schema: object;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  endpoint?: EndpointKind;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await post(
    {
      messages: opts.messages,
      stream: false,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.3,
      top_p: opts.topP ?? 0.85,
      top_k: opts.topK ?? 30,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'result', strict: true, schema: opts.schema },
      },
    },
    opts.signal,
    opts.endpoint ?? 'main'
  );

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  try {
    return JSON.parse(content) as T;
  } catch {
    // 兜底：截取第一个 { 到最后一个 }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as T;
      } catch {
        // fallthrough
      }
    }
    throw new LLMError('AI 返回的内容格式不对（可能被截断了），请再试一次。');
  }
}

export interface RemoteModelInfo {
  id: string;
  loaded: boolean;
}

/** 获取 llama-server 当前注册的模型列表（含加载状态） */
export async function listAvailableModels(baseUrl?: string): Promise<RemoteModelInfo[]> {
  const base = normalizeApiUrl(baseUrl ?? loadConfig().llmApiUrl);
  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list
      .map((m) => ({
        id: String(m?.id ?? '').trim(),
        loaded: m?.status?.value === 'loaded',
      }))
      .filter((m) => Boolean(m.id) && !isUnsupportedModelId(m.id));
  } catch {
    return [];
  }
}

/** 检查本地模型服务是否在线；可传入尚未保存的地址用于“测试连接” */
export async function checkLLMStatus(baseUrl?: string): Promise<boolean> {
  const base = normalizeApiUrl(baseUrl ?? loadConfig().llmApiUrl);
  try {
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ───────────────────────────── 文本工具 ─────────────────────────────

/**
 * 解析“标题：xxx\n\n正文”格式的流式文本。
 * title 仅在标题行完整（出现换行）后才返回，避免流式过程中标题闪烁。
 */
export function parseTitledEssay(raw: string): { title?: string; body: string } {
  let text = raw.replace(/\*\*|__|^#+\s*/gm, '');
  let title: string | undefined;

  const m = text.match(/^\s*(?:作文)?标题\s*[：:]\s*([^\n]*)(\n|$)/);
  if (m) {
    if (m[2] === '\n') title = m[1].replace(/[《》]/g, '').trim() || undefined;
    text = text.slice(m[0].length);
  }

  const body = text
    .replace(/^\s*(?:正文|作文正文)\s*[：:]\s*/, '')
    .replace(/^\s+/, '');
  return { title, body };
}

const normalize = (s: string) => s.replace(/\s+/g, '');

// ───────────────────────────── 通用类型 ─────────────────────────────

/** 所有 AI 任务都需要知道“哪个年级、什么体裁”，据此从提示词库取模板 */
interface Ctx {
  profile: GradeProfile;
  genre: string;
  signal?: AbortSignal;
}

type TitledHandler = (title: string | undefined, body: string) => void;

/** 估算 token 上限：保证足够写满 target ~ target+80 字且不在结尾句中截断，同时限制上限防止长篇大论 */
const tokensForChars = (chars: number) => Math.round(chars * 1.12) + 140;

async function streamTitled(opts: {
  messages: ChatMessage[];
  maxTokens: number;
  fallbackTitle: string;
  signal?: AbortSignal;
  onText?: TitledHandler;
  /** 考场字数兜底：若初稿比目标字数少超过 20 字，自动触发一次细节扩充确保字数达标 */
  lengthGuard?: {
    profile: GradeProfile;
    genre: string;
    target: number;
  };
}): Promise<{ title: string; body: string }> {
  const raw = await chatStream({
    messages: opts.messages,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onText: (acc) => {
      const { title, body } = parseTitledEssay(acc);
      opts.onText?.(title, body);
    },
  });
  const first = parseTitledEssay(raw);
  const firstTitle = first.title || opts.fallbackTitle;
  const firstCount = countChars(first.body);

  // 如果开启了考场字数保障，且生成字数比目标少超过 20 字（如目标 450 字却只写了 370 字），自动补充细节使字数达标
  if (opts.lengthGuard && firstCount >= 80 && firstCount < opts.lengthGuard.target - 20) {
    const expandMessages = buildExpandShortEssayMessages({
      profile: opts.lengthGuard.profile,
      genre: opts.lengthGuard.genre,
      title: firstTitle,
      essay: first.body,
      target: opts.lengthGuard.target,
    });
    const expandedRaw = await chatStream({
      messages: expandMessages,
      maxTokens: tokensForChars(opts.lengthGuard.target + 80),
      signal: opts.signal,
      onText: (acc) => {
        const { title, body } = parseTitledEssay(acc);
        // 当扩充稿字数开始推进或正在重写时实时更新界面
        if (body) opts.onText?.(title || firstTitle, body);
      },
    });
    const second = parseTitledEssay(expandedRaw);
    if (countChars(second.body) >= firstCount) {
      return { title: second.title || firstTitle, body: second.body };
    }
  }

  return { title: firstTitle, body: first.body };
}

// ───────────────────────────── 学一学：范文 ─────────────────────────────

export function generateSampleEssay(
  p: Ctx & { title: string; wordCount: number; requirements?: string; onText: TitledHandler }
) {
  return streamTitled({
    messages: buildSampleEssayMessages(p),
    maxTokens: tokensForChars(p.wordCount + 80),
    fallbackTitle: p.title,
    signal: p.signal,
    onText: p.onText,
    lengthGuard: { profile: p.profile, genre: p.genre, target: p.wordCount },
  });
}

export function reviseEssay(
  p: Ctx & { title: string; essay: string; request: string; wordCount?: number; onText: TitledHandler }
) {
  const target = p.wordCount ?? p.profile.defaultWordCount;
  return streamTitled({
    messages: buildReviseMessages(p),
    maxTokens: tokensForChars(target + 80),
    fallbackTitle: p.title,
    signal: p.signal,
    onText: p.onText,
    lengthGuard: { profile: p.profile, genre: p.genre, target },
  });
}

// ───────────────────────────── 想一想 ─────────────────────────────

type IdeaFeedback = IdeaTrainingSession['aiFeedback'];
type IdeaStructure = IdeaTrainingSession['generatedDraft']['structure'];

// ───────────────────────────── 盲盒出题 ─────────────────────────────

const normTopic = (t: string) => t.replace(/[\s《》“”"'‘’，。！？、：:,.!?…·\-—]/g, '');

const bigrams = (t: string): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};

/** 题目是否与已见过的题目“撞车”：完全相同、互相包含，或字面相似度过高 */
function isDuplicateTopic(topic: string, known: string[]): boolean {
  const a = normTopic(topic);
  if (!a) return true;
  const ba = bigrams(a);
  for (const k of known) {
    const b = normTopic(k);
    if (!b) continue;
    if (a === b) return true;
    if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
    if (ba.size && a.length >= 4 && b.length >= 4) {
      const bb = bigrams(b);
      let inter = 0;
      ba.forEach((g) => bb.has(g) && inter++);
      if (inter / (ba.size + bb.size - inter) >= 0.5) return true;
    }
  }
  return false;
}

/** 小模型常见的“半截话”：以虚词/量词结尾，或只有 1 个字 */
const STUB_ENDINGS = ['的', '和', '与', '及', '在', '是', '了', '关于', '假如', '如果', '一只', '一个', '一次', '一位', '我和', '当', '被', '把'];
function isStubTopic(topic: string): boolean {
  if (topic.length < 2) return true;
  return STUB_ENDINGS.some((e) => topic.endsWith(e) && topic.length <= e.length + 3);
}

/** 随机取 n 个不重复元素 */
function sample<T>(list: T[], n: number): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

/** 上一次用过的体裁 / 切入角度，避免连续撞车 */
let lastGenre = '';
let lastAngle = '';
const sessionTopics: string[] = [];

/** 最近出过的题（新→旧），发给 AI 让它避开 */
function recentTopics(n: number, extra: string[] = []): string[] {
  const all = [...extra.slice().reverse(), ...sessionTopics.slice().reverse(), ...getTopicHistory().map((h) => h.topic)];
  return Array.from(new Set(all)).slice(0, n);
}

/** 统计最近题目里反复出现的开头（前 2 字）和词，提醒 AI 换说法（纯统计，不含任何题材库） */
function overusedPatterns(recent: string[]): string[] {
  const count = new Map<string, number>();
  const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
  for (const t of recent) {
    const n = normTopic(t);
    if (n.length >= 2) bump('开头“' + n.slice(0, 2) + '”');
    for (const g of bigrams(n)) bump('“' + g + '”');
  }
  return [...count.entries()]
    .filter(([k, v]) => v >= 3 || (k.startsWith('开头') && v >= 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);
}

/** 空泛、无画面的词 */
const VAGUE_RE = /小事|那件事|一件事|难忘/;

/** 写人题禁止以食物、物品、地点、时间、季节、动植物或事件作为中心词结尾 */
const PERSON_BAD_ENDING_RE =
  /(?:饭|菜|面|汤|粥|饺子|味道|香气|礼物|书包|橡皮|铅笔|钢笔|文具盒|雨伞|闹钟|手表|照片|相册|奖状|蒲扇|老花镜|院子|菜园|花园|阳台|厨房|书房|房间|校园|教室|操场|小路|街角|秘密|故事|往事|经历|教训|启示|比赛|风波|争吵|吵架|误会|约定|承诺|道歉|尝试|挑战|掌声|泪水|背影|双手|眼神|目光|笑容|微笑|白发|皱纹|声音|脚步声|那一天|那天|一天|午后|早晨|清晨|夜晚|黄昏|周末|假期|春天|夏天|秋天|冬天|雨|雪|风|星空|小狗|小猫|橘猫|乌龟|仓鼠|金鱼|绿萝|多肉|仙人掌|向日葵)$/;

/** 写人题应当包含的人物称谓、角色或拟人化称号特征 */
const PERSON_MARKER_RE =
  /妈|爸|爷|奶|外公|外婆|姥|叔|姨|舅|姑|哥|姐|弟|妹|父母|家人|老伴|老师|班主任|同桌|同学|室友|朋友|伙伴|知己|闺蜜|邻居|班长|队长|少年|女孩|男孩|姑娘|小子|先生|女士|阿姨|大爷|大叔|大妈|伯伯|师傅|保安|快递|外卖|清洁工|环卫|交警|司机|医生|护士|摊主|店主|陌生人|他|她|达人|迷|虫|王|狂|家|手|星|侠|迷糊|热心|慢性子|急性子|倔强|严厉|温柔|幽默|唠叨|大厨|能人|怪才|老顽童|小书虫|乐天派|话匣子/;

/** 单纯点明人物称呼的题目（属于写人，不应出现在记事/写景/状物中） */
const PURE_PERSON_RE =
  /^(?:我的|我家的|那位|一位|那个|最.+的|爱.+的)?(?:妈妈|爸爸|老爸|老妈|爷爷|奶奶|外公|外婆|姥姥|姥爷|老师|班主任|同桌|同学|好朋友|伙伴|哥哥|姐姐|弟弟|妹妹|邻居|叔叔|阿姨|保安|修车大爷)$/;

/** 各体裁的题目形式与中心词校验，防止文体错位（如写人题出成《妈妈做的饭》） */
function fitsGenre(topic: string, genre: string): boolean {
  const t = normTopic(topic);
  if (!t) return false;
  if (genre !== '想象' && /^(?:假如|如果)/.test(t)) return false;
  if (genre === '读后感') {
    return /读|有感|启示|感悟|感想|带给我|合上|品读/.test(t);
  }
  if (genre === '写人') {
    if (PERSON_BAD_ENDING_RE.test(t)) return false;
    if (!PERSON_MARKER_RE.test(t)) return false;
    return true;
  }
  if (genre === '记事') {
    if (PURE_PERSON_RE.test(t)) return false;
    return true;
  }
  if (genre === '写景') {
    if (PURE_PERSON_RE.test(t)) return false;
    if (/(?:妈妈|爸爸|爷爷|奶奶|外公|外婆|老师|同桌|朋友|比赛|风波|吵架|做饭|洗碗|考试|道歉|秘密)$/.test(t)) {
      return false;
    }
    return true;
  }
  if (genre === '状物') {
    if (PURE_PERSON_RE.test(t)) return false;
    if (/(?:妈妈|爸爸|爷爷|奶奶|外公|外婆|老师|同桌|朋友|那次|第一次|比赛|风波|吵架|道歉|秘密|的一天|的午后)$/.test(t)) {
      return false;
    }
    return true;
  }
  return true;
}

/** 已见过的全部题目：持久化的历史 + 本次会话 + 预取队列 */
function knownTopics(extra: string[] = []): string[] {
  return [...getTopicHistory().map((h) => h.topic), ...sessionTopics, ...extra];
}

function rememberTopic(topic: string) {
  if (!sessionTopics.includes(topic)) sessionTopics.push(topic);
  if (sessionTopics.length > 60) sessionTopics.shift();
}

/**
 * 让模型生成【1 道】盲盒作文题（走家长区配置的“出题模型”，默认共用主力模型）。
 * 题材内容完全由 AI 自己想；代码按当前体裁匹配切入角度和长度风格，
 * 并严格校验文体中心词、拦截半句话与重复结果，必要时自动重试。
 */
export async function generateBlindBoxTopic(p: {
  profile: GradeProfile;
  genre?: string;
  locked?: boolean;
  avoid?: string[];
  signal?: AbortSignal;
}): Promise<TopicCard> {
  const { profile } = p;
  const stage = profile.stage;
  const known = knownTopics(p.avoid);
  const activeModel = resolveEndpoint('topic').model;
  let lastError: unknown = null;
  let fallbackCard: TopicCard | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    // 1) 体裁：锁定时用锁定的，否则随机（尽量不连续出同一体裁）
    const genre =
      p.locked && p.genre
        ? p.genre
        : sample(profile.genres.filter((g) => g !== lastGenre).length ? profile.genres.filter((g) => g !== lastGenre) : profile.genres, 1)[0];

    // 2) 按当前体裁 + 学段严格匹配的切入角度 + 字数风格
    const angle = pickAngle(genre, stage, lastAngle);
    const lengthStyle = pickLengthStyle(genre);
    const recent = recentTopics(12, p.avoid);
    const recentHeads = recent.slice(0, 6).map((t) => normTopic(t).slice(0, 2));

    try {
      const r = await chatJSON<{ topic: string; tip: string }>({
        messages: buildTopicGenMessages({
          profile,
          genre,
          angle,
          lengthText: lengthStyle.text,
          avoid: recent,
          overused: overusedPatterns(recent),
        }),
        schema: buildTopicGenSchema(),
        maxTokens: 160,
        temperature: 0.85,
        topP: 0.9,
        topK: 40,
        endpoint: 'topic',
        signal: p.signal,
      });

      const topic = (r.topic ?? '')
        .replace(/^【[^】]+】\s*/, '')
        .replace(/[《》“”"'‘’]/g, '')
        .trim();
      const tip = (r.tip ?? '').trim();

      if (!topic || topic.length > 15 || !tip) continue;
      if (isStubTopic(topic)) continue;
      if (VAGUE_RE.test(topic)) continue;
      if (!fitsGenre(topic, genre)) continue;
      // 小学阶段题目里不要出现“你”（像在对孩子提问，而不是作文题）
      if ((stage === 'lower' || stage === 'upper') && topic.includes('你')) continue;

      // 只有通过了文体匹配与基础质量校验的题目，才允许作为重试兜底
      fallbackCard = { topic, genre, tip, model: activeModel };

      // 开头与最近几道题的开头相同（如连续“假如…”“那个…”），换一道
      if (topic.length >= 2 && recentHeads.includes(normTopic(topic).slice(0, 2))) continue;
      if (isDuplicateTopic(topic, known)) continue;

      lastGenre = genre;
      lastAngle = angle;
      return { topic, genre, tip, model: activeModel };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastError = e;
      // 如果是连接失败或模型无法加载的服务端错误，立即抛出，不要在循环里连试 4 次
      if (e instanceof LLMError && !/格式不对/.test(e.message)) {
        throw e;
      }
    }
  }
  if (fallbackCard) {
    lastGenre = fallbackCard.genre;
    return fallbackCard;
  }
  throw lastError ?? new LLMError('AI 没有想出符合该体裁的题目，请再点一次试试。');
}

/**
 * 抽盲盒题：纯 AI 盲盒出题模式，每次点击都由 AI 当场生成 1 道新题，无内置题库、无预取缓存。
 */
export async function drawBlindBoxTopic(opts: {
  profile: GradeProfile;
  genre?: string;
  locked?: boolean;
  currentTopic?: string;
  signal?: AbortSignal;
}): Promise<{ card: TopicCard; source: 'ai' }> {
  const { profile, genre, locked, currentTopic } = opts;
  if (currentTopic) rememberTopic(currentTopic);

  const card = await generateBlindBoxTopic({ profile, genre, locked, signal: opts.signal });
  rememberTopic(card.topic);
  return { card: locked && genre ? { ...card, genre } : card, source: 'ai' };
}

export async function coachIdea(
  p: Ctx & { topic: string; outline: string }
): Promise<{ feedback: IdeaFeedback; structure: IdeaStructure }> {
  const r = await chatJSON<IdeaFeedback & { structure: IdeaStructure }>({
    messages: buildIdeaFeedbackMessages(p),
    schema: IDEA_FEEDBACK_SCHEMA,
    maxTokens: 900,
    signal: p.signal,
  });
  return {
    feedback: { praise: r.praise, scaffoldingQuestions: r.scaffoldingQuestions, keyTips: r.keyTips },
    structure: r.structure,
  };
}

export function writeIdeaDraft(
  p: Ctx & { topic: string; outline: string; questions: string[]; onText: TitledHandler }
) {
  const wc = p.profile.defaultWordCount;
  return streamTitled({
    messages: buildIdeaDraftMessages({ ...p, wordCount: wc }),
    maxTokens: tokensForChars(wc + 80),
    fallbackTitle: p.topic,
    signal: p.signal,
    onText: p.onText,
    lengthGuard: { profile: p.profile, genre: p.genre, target: wc },
  });
}

/** 从作文中挑金句；校验必须是原文片段，防止模型“改写”后收藏到假句子 */
export async function pickGoldenSentences(p: Ctx & { essay: string }): Promise<string[]> {
  const fallback = () =>
    p.essay
      .split(/(?<=[。！？])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

  try {
    const r = await chatJSON<{ goldenSentences: string[] }>({
      messages: buildGoldenSentenceMessages(p),
      schema: GOLDEN_SENTENCES_SCHEMA,
      maxTokens: 400,
      signal: p.signal,
    });
    const flat = normalize(p.essay);
    const valid = r.goldenSentences.map((s) => s.trim()).filter((s) => s && flat.includes(normalize(s)));
    return valid.length ? valid : fallback();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return fallback();
  }
}

// ───────────────────────────── 写一写：卡壳求提示 ─────────────────────────────

/** 只给启发、不替学生写句子；流式返回 */
export function hintNext(p: Ctx & { title: string; draft: string; onText?: (text: string) => void }) {
  return chatStream({
    messages: buildHintMessages({ ...p, draft: p.draft.slice(-1500) }),
    maxTokens: 260,
    temperature: 0.7,
    signal: p.signal,
    onText: p.onText,
  });
}

// ───────────────────────────── 改一改 ─────────────────────────────

type Diagnostics = CorrectionReport['diagnostics'];
type Score = CorrectionReport['score'];

export async function diagnoseEssay(
  p: Ctx & { title: string; essay: string }
): Promise<{ score: Score; diagnostics: Diagnostics }> {
  const { rubric } = p.profile;
  const comp = analyzeEssayCompleteness(p.essay, p.profile.defaultWordCount);
  const r = await chatJSON<
    { score: { structure: number; wording: number; emotion: number } } & Diagnostics
  >({
    messages: buildDiagnoseMessages(p),
    schema: buildDiagnoseSchema(rubric),
    maxTokens: 1200,
    signal: p.signal,
  });

  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  let structure = clamp(r.score.structure, rubric.structure.max);
  let wording = clamp(r.score.wording, rubric.wording.max);
  let emotion = clamp(r.score.emotion, rubric.emotion.max);

  // 若文章明显没写完（如只有 1 段或字数不足一半），严格限制结构分与总分上限，符合真实考场扣分标准
  if (comp.isUnfinished) {
    const ratio = Math.max(0.18, comp.charCount / Math.max(1, comp.targetWords));
    const maxStruct = comp.paraCount <= 1 ? Math.ceil(rubric.structure.max * 0.35) : Math.ceil(rubric.structure.max * 0.5);
    structure = Math.min(structure, maxStruct);
    if (ratio < 0.35) {
      wording = Math.min(wording, Math.ceil(rubric.wording.max * 0.45));
      emotion = Math.min(emotion, Math.ceil(rubric.emotion.max * 0.4));
    }
  }

  // 只保留 error 确实出现在原文里的纠错，避免 AI 编造“错误”误导学生
  const flat = normalize(p.essay);
  const typosAndGrammar = (r.typosAndGrammar ?? []).filter(
    (t) => t.error && flat.includes(normalize(t.error)) && normalize(t.error) !== normalize(t.fix)
  );

  const runOnSentenceWarning = [...(r.runOnSentenceWarning ?? [])];
  const improvementSuggestions = [...(r.improvementSuggestions ?? [])];

  // 代码级兜底保障：若作文未写完或字数严重不足，确保诊断列表第 1 条明确点出“没写完/字数不足/结构不完整”
  if (comp.isUnfinished || comp.isUnderLength) {
    const mentionsIncomplete = (list: string[]) =>
      list.some((item) => /没写完|未写完|未完成|半截|字数|篇幅|结构不完整|缺少.*段|只有.*段|缺少结尾|尚未收尾/.test(item));

    if (!mentionsIncomplete(runOnSentenceWarning)) {
      const prefix = comp.isUnfinished ? '【文章尚未写完】' : '【篇幅尚未达标】';
      runOnSentenceWarning.unshift(
        `${prefix}：${comp.issues.join('；')}。在考场上未写完或字数差太多会被首先扣除结构与字数分。`
      );
    }

    if (comp.isUnfinished && !improvementSuggestions.some((s) => /写完|写完整|续写|补齐|补全|中间段|结尾段/.test(s))) {
      improvementSuggestions.unshift(
        `【先把文章写完整】：目前只开了个头（${comp.charCount} 字），请接着往下另起 1~2 个自然段写出具体的事例过程（把人物当时做了什么、说了什么写出来），最后再用 1 个自然段点题收尾，补足到 ${comp.targetWords} 字以上。`
      );
    }
  }

  return {
    score: { total: structure + wording + emotion, structure, wording, emotion },
    diagnostics: {
      typosAndGrammar,
      runOnSentenceWarning: runOnSentenceWarning.slice(0, 4),
      goodPoints: r.goodPoints ?? [],
      improvementSuggestions: improvementSuggestions.slice(0, 4),
    },
  };
}

export function upgradeEssay(
  p: Ctx & { title: string; essay: string; suggestions: string[]; onText: TitledHandler }
) {
  // 升格后篇幅对齐本年级考场目标字数（若学生原文已接近或略超目标字数，保持在合理上限内）
  const baseTarget = p.profile.defaultWordCount;
  const target = Math.max(
    baseTarget,
    Math.min(baseTarget + 50, Math.round(countChars(p.essay) * 1.15))
  );
  return streamTitled({
    messages: buildUpgradeMessages({ ...p, wordCount: target }),
    maxTokens: tokensForChars(target + 80),
    fallbackTitle: p.title,
    signal: p.signal,
    onText: p.onText,
    lengthGuard: { profile: p.profile, genre: p.genre, target: baseTarget },
  });
}

export async function compareEssays(
  p: Ctx & { original: string; upgraded: string }
): Promise<CorrectionReport['diffComparisons']> {
  const r = await chatJSON<{ diffComparisons: CorrectionReport['diffComparisons'] }>({
    messages: buildCompareMessages(p),
    schema: COMPARE_SCHEMA,
    maxTokens: 900,
    signal: p.signal,
  });

  // 原文片段必须真实存在，才展示这条对比
  const flatOriginal = normalize(p.original);
  return (r.diffComparisons ?? []).filter(
    (d) => d.originalExcerpt?.trim() && d.upgradedExcerpt?.trim() && flatOriginal.includes(normalize(d.originalExcerpt))
  );
}
