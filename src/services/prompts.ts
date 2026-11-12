/**
 * 作文训练助手 · Prompt 渲染
 * 模板文本来自提示词库（内置默认 + 家长区覆盖），这里负责：
 * 1. 把年级画像、文体库展开成模板变量
 * 2. 渲染模板，拼出发给模型的 messages
 */
import type { GradeProfile, Rubric } from '../data/gradeProfiles';
import type { PromptTaskId } from '../data/promptTemplates';
import { getGenreGuide, getPromptTemplate } from './libraryStore';
import { analyzeEssayCompleteness } from '../utils/text';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 正文字数（不含空白） */
export const countChars = (text: string): number => text.replace(/\s/g, '').length;

// ───────────────────────────── 模板引擎 ─────────────────────────────

/** 把 {{变量}} 替换成对应值；未知变量原样保留，方便家长区预览时发现写错 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

const rubricText = (r: Rubric) =>
  (['structure', 'wording', 'emotion'] as const)
    .map((k) => `- ${k} ${r[k].label}（0~${r[k].max}）：${r[k].desc}`)
    .join('\n');

export const rubricTotal = (r: Rubric) => r.structure.max + r.wording.max + r.emotion.max;

/** 不同学段的作文命题特点与题型分布指南 */
const STAGE_TOPIC_STYLE: Record<GradeProfile['stage'], string> = {
  lower:
    '小学中年级（三、四年级）：题目应亲切平实、直观好懂、贴近童心。既要有写家人伙伴、心爱小动物、校园日常、第一次尝试的经典好下笔题目，也可以有 1~3 字的短题或充满童趣的奇思妙想题。',
  upper:
    '小学高年级（五、六年级）：题目应兼顾真情实感与生活细节，长短错落。可自然搭配 1~2 字的凝练独词/双字题、3~6 字平实亲切的经典写人记事/状物写景题，以及 7~14 字带有具体情境或成长触动的题目。',
  junior:
    '初中（七~九年级）：题目应贴近青春成长、生活体悟、人际温情与独立思考。可涵盖 1~2 字的凝练题、富有画面感与文学气息的记叙/散文题，以及引发思考的议论/说明/读后感题目。',
  senior:
    '高中（高一~高三）：题目应具备思辨张力、时代视野、审美意蕴或现实关怀。可涵盖 1~4 字的概念/二元关系题、富有哲思与意境的散文/记叙题，以及切中时代议题的议论/时评题。',
};

/**
 * 把目标总字数转化为大模型最容易执行的“分段字数与句数配比指南”：
 * 符合考场阅卷标准——保底不低于目标字数 wc（最多差不超过 20 字），理想篇幅为 wc ~ wc+80 字。
 */
export function buildParagraphPlan(wc: number, paragraphHint: string): string {
  const minW = wc;
  const maxW = wc + 80;
  const openClose = Math.max(45, Math.round(wc * 0.16));
  const bodyTotal = Math.round(wc * 0.75);
  const eachBody = Math.round(bodyTotal / 2.5);
  return `考场硬性要求不少于 ${minW} 字（字数不足会扣分！），理想篇幅为 ${minW}~${maxW} 字（最多绝不超过 ${wc + 90} 字）。请按 ${paragraphHint} 规划篇幅：开头段约 ${openClose} 字（2~3 句话自然点题）；中间 2~3 个重点自然段务必充分展开细节（每段约 ${eachBody}~${eachBody + 30} 字，每段写足 4~6 句话，把动作、语言、神态、心理或环境描写写饱满，切忌两三句话匆匆带过）；结尾段约 ${openClose} 字点明感悟收束。`;
}

/** 展开模板变量 */
export function buildVars(profile: GradeProfile, genre: string, wordCount?: number): Record<string, string> {
  const wc = wordCount ?? profile.defaultWordCount;
  const guide = getGenreGuide(genre);
  const total = rubricTotal(profile.rubric);
  return {
    gradeName: profile.name,
    stageName: profile.stageName,
    teacherRole: profile.teacherRole,
    voice: profile.voice,
    focus: profile.focus.join('、'),
    requirements: profile.requirements,
    paragraphHint: profile.paragraphHint,
    genres: profile.genres.join('、'),
    genre,
    genreGuide: guide.guide,
    questionDirections: guide.questionDirections,
    topicStyle: STAGE_TOPIC_STYLE[profile.stage],
    wordCount: String(wc),
    minWords: String(wc),
    maxWords: String(wc + 80),
    rubric: rubricText(profile.rubric),
    scoreTotal: String(total),
    typicalScore: `${Math.round(total * 0.6)}~${Math.round(total * 0.76)}`,
  };
}

/** 渲染某个任务的 system 提示词（先渲染老师人设，再嵌入各任务模板） */
export function renderTask(
  id: PromptTaskId,
  profile: GradeProfile,
  genre: string,
  wordCount?: number,
  /** 预览用：指定模板文本，不读取库里已保存的版本 */
  templateOverride?: string
): string {
  const vars = buildVars(profile, genre, wordCount);
  const personaTemplate = id === 'persona' && templateOverride ? templateOverride : getPromptTemplate('persona');
  vars.persona = renderTemplate(personaTemplate, vars);
  if (id === 'persona') return vars.persona;
  return renderTemplate(templateOverride ?? getPromptTemplate(id), vars);
}

interface Base {
  profile: GradeProfile;
  genre: string;
}

const pair = (system: string, user: string): ChatMessage[] => [
  { role: 'system', content: system },
  { role: 'user', content: user },
];

// ───────────────────────────── 学一学：范文 ─────────────────────────────

export function buildSampleEssayMessages(p: Base & {
  title: string;
  wordCount: number;
  requirements?: string;
}): ChatMessage[] {
  return pair(
    renderTask('sampleEssay', p.profile, p.genre, p.wordCount),
    `题目：《${p.title}》
年级：${p.profile.name}（${p.profile.stageName}）
体裁：${p.genre}
篇幅与分段要求：${buildParagraphPlan(p.wordCount, p.profile.paragraphHint)}
特别要求：${p.requirements?.trim() || '无'}
请开始写作。`
  );
}

export function buildReviseMessages(p: Base & {
  title: string;
  essay: string;
  request: string;
  wordCount?: number;
}): ChatMessage[] {
  const target = p.wordCount ?? p.profile.defaultWordCount;
  const minW = target;
  const maxW = target + 80;
  const currentChars = countChars(p.essay);
  const lengthNote =
    currentChars > maxW + 10
      ? `注意：当前文章已有 ${currentChars} 字，超出了${p.profile.name}考场合理篇幅上限（标准 ${target} 字，上限 ${maxW} 字）。本次修改时请务必一并精简冗余词句，将修改后的全文总字数收敛回 ${minW}~${maxW} 字之间！`
      : currentChars < minW - 20
      ? `注意：当前文章只有 ${currentChars} 字，比${p.profile.name}考试要求（不少于 ${minW} 字）还差 ${minW - currentChars} 字！本次修改时请一并充实中间段落的细节描写，使修改后的全文总字数达到 ${minW}~${maxW} 字！`
      : `注意：当前文章 ${currentChars} 字，${p.profile.name}考试要求不少于 ${minW} 字（理想篇幅 ${minW}~${maxW} 字）。修改后请确保全文总字数保持在 ${minW}~${maxW} 字之间（既不能少于 ${minW - 15} 字，也不要超出 ${maxW} 字）！`;

  return pair(
    renderTask('reviseEssay', p.profile, p.genre, target),
    `【当前作文（${p.profile.name} · 当前 ${currentChars} 字 · 考场目标 ${minW}~${maxW} 字）】
标题：${p.title}

${p.essay}

【学生的修改要求】
${p.request}

【篇幅硬性约束】
${lengthNote}`
  );
}

// ───────────────────────────── 想一想 ─────────────────────────────

/** 盲盒出题：每次只出 1 道（体裁由代码指定，所以 schema 里不再让模型选体裁） */
export function buildTopicGenSchema() {
  return {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      tip: { type: 'string' },
    },
    required: ['topic', 'tip'],
  } as const;
}

/** 各体裁“题目该落在什么上”，防止体裁与题目错位（如写人题出成《妈妈做的饭》） */
const GENRE_TITLE_HINT: Record<string, string> = {
  写人: '题目中心词（最后一个词）必须是“某个人”或人物称呼/外号（如《爱操心的外婆》《我的“慢动作”同桌》《修车摊的老爷爷》《家有“小书虫”》），严禁把题目落脚在饭菜、物品、地点、身体部位或事件上（如严禁出成《妈妈做的饭》《爷爷的菜园》《那次比赛》）！',
  记事: '题目核心必须是一次具体的经历、事件或难忘瞬间（如《第一次独自走夜路》《厨房里的“交响曲”》《迟到的道歉》），严禁只写一个人名/称呼（如《我的妈妈》）或只写一个物品/景物名！',
  写景: '题目中心词必须是一处具体的自然风景、场所景色、季节或天气现象（如《雨后的校园》《秋天的银杏林》《外婆家的小院》《夏夜星空》），严禁写成写人或记事！',
  状物: '题目中心词必须是一件具体的物品、文具玩具、一种小动物或植物（如《窗台上的绿萝》《我家的小橘猫》《陪伴我的小闹钟》《外婆的老蒲扇》），严禁写成写人、写景或记事！',
  想象: '题目必须体现奇思妙想、童话奇遇、未来世界、身份变身或“假如/如果…”设想（如《假如我会变身》《二十年后的家乡》《铅笔盒里的夜半争吵》），不能是普通日常写实题！',
  读后感: '题目必须明确围绕一本书或一篇课文的读后感悟（如《读〈xxx〉有感》《〈xxx〉带给我的启示》）！',
  记叙文: '题目要落在具体的人、事或青春成长的触动瞬间上',
  议论文: '题目必须是一个可以展开论证的观点、品格或思辨话题（如《谈坚持》《慢下来的智慧》），不要写成记叙故事题',
  说明文: '题目必须明确指向要介绍说明的具体事物、传统技艺或科学现象',
  散文: '题目是一个富有意境的自然意象、生活气息或情感线索',
  材料作文: '题目聚焦一对思辨关系或核心概念的思考',
  时评: '题目针对一个具体的社会文化现象或时代议题',
};

export function buildTopicGenMessages(p: {
  profile: GradeProfile;
  /** 本次指定的具体体裁 */
  genre: string;
  /** 本次的切入角度（通用维度，只是提示方向） */
  angle: string;
  /** 本次的题目长度风格 */
  lengthText: string;
  /** 需要避开的、刚出过的题 */
  avoid: string[];
  /** 最近用得太多的开头/词（由代码统计得出） */
  overused?: string[];
}): ChatMessage[] {
  const isReading = p.genre === '读后感';
  const lines = [
    `请为${p.profile.name}（${p.profile.stageName}）学生出 1 道「${p.genre}」作文题。`,
    GENRE_TITLE_HINT[p.genre] ? `【体裁要求】${GENRE_TITLE_HINT[p.genre]}` : '',
    `【本次切入维度】${p.angle}（括号内仅作方向示意，请你结合${p.profile.name}学生的认知视野自主发散，构思具体、自然、不落俗套的题目，不要照搬示意词）`,
    `【题目长度与句式】${p.lengthText}`,
    isReading ? '【读后感格式】题目要像“读《书名》有感”“《书名》带给我的启示”这样，只围绕 1 本你确定真实存在、适合本年级的书或课文，不要把两本书混在一起。' : '',
    p.overused?.length ? `【最近这些开头或词用得太多了，请换个说法】${p.overused.join('、')}` : '',
    p.avoid.length ? `【不要和这些重复或相似】${p.avoid.map((t) => `《${t}》`).join('')}` : '',
    '只输出 JSON：{"topic": "题目", "tip": "破题小贴士"}，不要任何其他文字。',
  ];
  return pair(renderTask('topicGen', p.profile, p.genre), lines.filter(Boolean).join('\n'));
}

export const IDEA_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    praise: { type: 'string' },
    scaffoldingQuestions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    keyTips: { type: 'string' },
    structure: {
      type: 'object',
      properties: {
        beginning: { type: 'string' },
        body: { type: 'string' },
        ending: { type: 'string' },
      },
      required: ['beginning', 'body', 'ending'],
    },
  },
  required: ['praise', 'scaffoldingQuestions', 'keyTips', 'structure'],
} as const;

export function buildIdeaFeedbackMessages(p: Base & { topic: string; outline: string }): ChatMessage[] {
  const outlineText = p.outline.trim()
    ? p.outline.trim()
    : '（学生暂时还没有具体想法，请直接围绕题目展开破题与构思点拨，先肯定题目的独特角度与构思空间，再给出 3 个能立刻启发灵感的追问，并给出开头/中间/结尾结构示范）';
  return pair(
    renderTask('ideaFeedback', p.profile, p.genre),
    `作文题目：《${p.topic}》（${p.genre}，${p.profile.name}）
学生的口述想法：${outlineText}`
  );
}

export function buildIdeaDraftMessages(p: Base & {
  topic: string;
  outline: string;
  questions: string[];
  wordCount?: number;
}): ChatMessage[] {
  const wc = p.wordCount ?? p.profile.defaultWordCount;
  const outlineText = p.outline.trim()
    ? p.outline.trim()
    : '（学生未提供个人素材，请老师围绕题目自主构思生动的生活化情境与真情实感）';
  return pair(
    renderTask('ideaDraft', p.profile, p.genre, wc),
    `作文题目：《${p.topic}》（${p.genre}，${p.profile.name}）
学生的口述想法：${outlineText}
启发问题：
${p.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
【篇幅与分段要求】${buildParagraphPlan(wc, p.profile.paragraphHint)}
请开始写作。`
  );
}

export const GOLDEN_SENTENCES_SCHEMA = {
  type: 'object',
  properties: {
    goldenSentences: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
  },
  required: ['goldenSentences'],
} as const;

export function buildGoldenSentenceMessages(p: Base & { essay: string }): ChatMessage[] {
  return pair(renderTask('goldenSentences', p.profile, p.genre), p.essay);
}

// ───────────────────────────── 写一写：卡壳求提示 ─────────────────────────────

export function buildHintMessages(p: Base & { title: string; draft: string }): ChatMessage[] {
  return pair(
    renderTask('writingHint', p.profile, p.genre),
    `题目：《${p.title || '（未定题目）'}》
学生已经写的内容：
${p.draft}`
  );
}

// ───────────────────────────── 改一改 ─────────────────────────────

/** 评分 schema：各维度的上限来自年级画像（小学 50 分，高中 60 分） */
export function buildDiagnoseSchema(rubric: Rubric) {
  return {
    type: 'object',
    properties: {
      score: {
        type: 'object',
        properties: {
          structure: { type: 'integer', minimum: 0, maximum: rubric.structure.max },
          wording: { type: 'integer', minimum: 0, maximum: rubric.wording.max },
          emotion: { type: 'integer', minimum: 0, maximum: rubric.emotion.max },
        },
        required: ['structure', 'wording', 'emotion'],
      },
      typosAndGrammar: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            fix: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['error', 'fix', 'reason'],
        },
      },
      runOnSentenceWarning: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      goodPoints: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      improvementSuggestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
    },
    required: ['score', 'typosAndGrammar', 'runOnSentenceWarning', 'goodPoints', 'improvementSuggestions'],
  } as const;
}

export function buildDiagnoseMessages(p: Base & { title: string; essay: string }): ChatMessage[] {
  const comp = analyzeEssayCompleteness(p.essay, p.profile.defaultWordCount);
  const statusLine = comp.isUnfinished
    ? `⚠️【完篇与字数预检：尚未写完 / 结构残缺】${comp.issues.join('；')}。
请在批改时首先重点指出“作文还没有写完、字数严重不足、篇章结构不完整”这一最核心的问题（放在 runOnSentenceWarning 第 1 条），并在 improvementSuggestions 第 1 条以“【先把文章写完整】：…”具体指导学生如何顺着现有内容把中间事例段和结尾段续写完整！`
    : comp.isUnderLength
    ? `⚠️【完篇与字数预检：字数未达标】${comp.issues.join('；')}。请在 runOnSentenceWarning 和 improvementSuggestions 中明确提醒字数差距，并指出可以在哪一段扩充细节描写以补足篇幅。`
    : `【完篇与字数预检】全文共 ${comp.charCount} 字，分 ${comp.paraCount} 个自然段（${p.profile.name}要求不少于 ${comp.targetWords} 字，篇幅已达标）。`;

  return pair(
    renderTask('diagnose', p.profile, p.genre),
    `作文题目：${p.title || '（未命名）'}
${statusLine}
作文正文：
${p.essay}`
  );
}

export function buildUpgradeMessages(p: Base & {
  title: string;
  essay: string;
  wordCount: number;
  suggestions: string[];
}): ChatMessage[] {
  return pair(
    renderTask('upgrade', p.profile, p.genre, p.wordCount),
    `【原题目】${p.title || '（未命名）'}
【学生原文】
${p.essay}

【老师发现的提升方向】
${p.suggestions.length ? p.suggestions.join('\n') : '增加细节与深度'}

【篇幅与分段要求】
${buildParagraphPlan(p.wordCount, p.profile.paragraphHint)}`
  );
}

/**
 * 当模型初次生成的作文字数不达标（少于 target - 20 字）时，自动扩充中间段落细节以达到考场字数要求。
 */
export function buildExpandShortEssayMessages(p: {
  profile: GradeProfile;
  genre: string;
  title: string;
  essay: string;
  target: number;
}): ChatMessage[] {
  const current = countChars(p.essay);
  const diff = p.target - current;
  const minW = p.target;
  const maxW = p.target + 75;
  return pair(
    renderTask('persona', p.profile, p.genre, p.target),
    `下面这篇${p.profile.name}《${p.title}》（${p.genre}）目前只有 ${current} 字，比考试要求的 ${minW} 字还差 ${diff} 字，在考场上会被扣字数分！
请你在【完全保留原有立意、故事脉络和开头结尾】的基础上，把中间段落的场景、人物动作、语言对话、神态或心理细节进一步展开写饱满，再自然扩充约 ${diff + 20}~${diff + 55} 字，使最终全文正文字数达到 ${minW}~${maxW} 字之间（但切勿超过 ${p.target + 85} 字）。
只输出扩充后的完整作文（第一行“标题：${p.title}”，空一行后输出完整正文），不要任何解释或说明。

【当前偏短的初稿（${current} 字）】
标题：${p.title}

${p.essay}`
  );
}

export const COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    diffComparisons: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          originalExcerpt: { type: 'string' },
          upgradedExcerpt: { type: 'string' },
          technique: { type: 'string' },
        },
        required: ['originalExcerpt', 'upgradedExcerpt', 'technique'],
      },
    },
  },
  required: ['diffComparisons'],
} as const;

export function buildCompareMessages(p: Base & { original: string; upgraded: string }): ChatMessage[] {
  return pair(
    renderTask('compare', p.profile, p.genre),
    `【学生原文】
${p.original}

【升格版本】
${p.upgraded}`
  );
}
