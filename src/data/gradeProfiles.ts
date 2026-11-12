/**
 * 年级画像（内置默认库）
 * 覆盖三年级 ~ 高三。每个年级一份“画像”，提示词模板通过变量引用，
 * 同一套模板即可自动适配全部年级。家长区可逐项覆盖，见 libraryStore。
 */

export type GradeLevel =
  | 'grade3'
  | 'grade4'
  | 'grade5'
  | 'grade6'
  | 'grade7'
  | 'grade8'
  | 'grade9'
  | 'grade10'
  | 'grade11'
  | 'grade12';

export type Stage = 'lower' | 'upper' | 'junior' | 'senior';

/** 评分维度：三个固定“槽位”，不同学段只改名称、满分和说明 */
export interface RubricItem {
  label: string;
  max: number;
  desc: string;
}

export interface Rubric {
  structure: RubricItem;
  wording: RubricItem;
  emotion: RubricItem;
}

export interface GradeProfile {
  id: GradeLevel;
  /** 展示名，如“五年级” */
  name: string;
  stage: Stage;
  /** 学段名称，如“小学高年级” */
  stageName: string;
  /** 老师的称谓，用于提示词人设，如“小学语文作文老师” */
  teacherRole: string;
  /** 默认作文字数 */
  defaultWordCount: number;
  /** 每篇作文建议的自然段数量描述 */
  paragraphHint: string;
  /** 本年级训练重点（每条一个要点） */
  focus: string[];
  /** 可选文体，界面里的“体裁”选项 */
  genres: string[];
  /** 对话语气与用词风格 */
  voice: string;
  /** 本年级的写作要求（写进范文/升格提示词） */
  requirements: string;
  /** 评分标准 */
  rubric: Rubric;
}

// ───────────────────────────── 学段公共配置 ─────────────────────────────

const PRIMARY_RUBRIC: Rubric = {
  structure: { label: '结构条理', max: 15, desc: '开头结尾完整，段落层次清楚，事情交代有条理' },
  wording: { label: '词句细节', max: 20, desc: '用词准确生动，有动作、心理、感官等具体细节，会用修辞' },
  emotion: { label: '情感真挚', max: 15, desc: '内容真实，有自己的真实感受，不空喊口号' },
};

const JUNIOR_RUBRIC: Rubric = {
  structure: { label: '结构思路', max: 15, desc: '结构完整，思路清晰，详略得当，过渡自然' },
  wording: { label: '语言表达', max: 20, desc: '语言流畅有文采，描写或论证到位，文体规范' },
  emotion: { label: '立意情感', max: 15, desc: '立意积极有深度，选材真实有新意，情感真挚' },
};

const SENIOR_RUBRIC: Rubric = {
  structure: { label: '发展等级', max: 20, desc: '结构严谨有层次，有创意与个性化表达，论述或叙事有深度' },
  wording: { label: '表达等级', max: 20, desc: '语言准确有文采，文体规范，句式富于变化' },
  emotion: { label: '内容等级', max: 20, desc: '立意深刻有思辨，材料契合，素材新颖得当，中心突出' },
};

const LOWER_BASE = {
  stage: 'lower' as const,
  stageName: '小学中年级',
  teacherRole: '小学语文作文老师',
  genres: ['写人', '记事', '写景', '状物', '想象', '读后感'],
  voice:
    '语言亲切、活泼，像大姐姐讲故事；句子要短，多用鼓励和形象的比喻，不用抽象术语，多给孩子具体的小例子。',
  requirements:
    '句子完整通顺，把时间、地点、人物、起因、经过、结果写清楚；至少用 1 处简单的比喻或拟人；用词朴实，不堆砌辞藻；内容贴近三四年级孩子的真实生活。',
  rubric: PRIMARY_RUBRIC,
};

const UPPER_BASE = {
  stage: 'upper' as const,
  stageName: '小学高年级',
  teacherRole: '小学语文作文老师',
  genres: ['写人', '记事', '写景', '状物', '想象', '读后感'],
  voice:
    '语气温暖亲切，以鼓励为主；可以使用比喻、拟人、排比等基础修辞术语，但要用孩子听得懂的话解释。',
  requirements:
    '有具体细节：动作、语言、神态、心理要写出来；至少 2 处比喻或拟人，至少 3 处感官描写（看到的、听到的、闻到的、摸到的）；开头结尾呼应；避免写成流水账；不写空洞的大道理。',
  rubric: PRIMARY_RUBRIC,
};

const JUNIOR_BASE = {
  stage: 'junior' as const,
  stageName: '初中',
  teacherRole: '初中语文老师',
  genres: ['记叙文', '议论文', '说明文', '散文', '读后感'],
  voice:
    '平等、尊重，鼓励为主，但要明确指出具体问题；可以使用记叙文六要素、描写方法、论点论据论证等术语。',
  requirements:
    '立意要有一定深度，选材真实、有新意；记叙文叙事有波澜，描写与抒情议论相结合；议论文要有明确的论点，论据兼顾事实与道理，论证有层次；语言流畅，有适度的文采。',
  rubric: JUNIOR_RUBRIC,
};

const SENIOR_BASE = {
  stage: 'senior' as const,
  stageName: '高中',
  teacherRole: '高中语文老师',
  genres: ['记叙文', '议论文', '材料作文', '散文', '时评'],
  voice:
    '像一位严谨又亲切的高中语文老师：对标高考作文评分标准，直接指出立意、论证逻辑、素材运用、语言上的具体问题，可以使用专业术语，评价要有理有据。',
  requirements:
    '对标高考作文评分：立意深刻有思辨，不浮于表面；结构严谨、层次分明；论据新颖得当（避免陈旧套路素材），论证有逻辑；语言准确有文采，文体规范；有个性化的思考和创意表达。',
  rubric: SENIOR_RUBRIC,
};

// ───────────────────────────── 内置年级画像 ─────────────────────────────

export const DEFAULT_GRADE_PROFILES: Record<GradeLevel, GradeProfile> = {
  grade3: {
    ...LOWER_BASE,
    id: 'grade3',
    name: '三年级',
    defaultWordCount: 250,
    paragraphHint: '3~4 个自然段',
    focus: ['把一件事按顺序写完整', '写通顺的句子', '正确使用标点', '开始尝试简单比喻'],
  },
  grade4: {
    ...LOWER_BASE,
    id: 'grade4',
    name: '四年级',
    defaultWordCount: 350,
    paragraphHint: '3~5 个自然段',
    focus: ['分段清晰', '尝试使用比喻拟人', '抓住特点写景写人', '把事情经过写具体'],
  },
  grade5: {
    ...UPPER_BASE,
    id: 'grade5',
    name: '五年级',
    defaultWordCount: 450,
    paragraphHint: '4~5 个自然段',
    focus: ['细节描写（动作、心理、语言）', '详略得当', '避免流水账', '真情实感'],
  },
  grade6: {
    ...UPPER_BASE,
    id: 'grade6',
    name: '六年级',
    defaultWordCount: 500,
    paragraphHint: '4~6 个自然段',
    focus: ['立意有深度', '首尾呼应', '环境烘托与借物喻人', '表达真情实感'],
  },
  grade7: {
    ...JUNIOR_BASE,
    id: 'grade7',
    name: '初一',
    defaultWordCount: 550,
    paragraphHint: '5~6 个自然段',
    focus: ['记叙文要素齐全', '描写方法综合运用', '选材真实有新意', '语言生动流畅'],
  },
  grade8: {
    ...JUNIOR_BASE,
    id: 'grade8',
    name: '初二',
    defaultWordCount: 600,
    paragraphHint: '5~7 个自然段',
    focus: ['叙事有波澜', '描写与抒情议论结合', '初步写出议论文的论点论据', '立意有思考'],
  },
  grade9: {
    ...JUNIOR_BASE,
    id: 'grade9',
    name: '初三',
    defaultWordCount: 650,
    paragraphHint: '5~7 个自然段',
    focus: ['对标中考作文标准', '审题准确立意深刻', '议论文论证有层次', '语言有文采'],
  },
  grade10: {
    ...SENIOR_BASE,
    id: 'grade10',
    name: '高一',
    defaultWordCount: 700,
    paragraphHint: '5~7 个自然段',
    focus: ['审题立意准确', '论点鲜明、论据充分', '结构清晰有层次', '语言有文采'],
  },
  grade11: {
    ...SENIOR_BASE,
    id: 'grade11',
    name: '高二',
    defaultWordCount: 800,
    paragraphHint: '5~7 个自然段',
    focus: ['思辨性与辩证分析', '素材新颖且运用得当', '论证逻辑严密', '形成个人风格'],
  },
  grade12: {
    ...SENIOR_BASE,
    id: 'grade12',
    name: '高三',
    defaultWordCount: 800,
    paragraphHint: '5~7 个自然段',
    focus: ['对标高考作文评分标准', '立意深刻、有思辨', '发展等级：创意与个性', '考场时间内高质量成文'],
  },
};

export const GRADE_ORDER: GradeLevel[] = [
  'grade3',
  'grade4',
  'grade5',
  'grade6',
  'grade7',
  'grade8',
  'grade9',
  'grade10',
  'grade11',
  'grade12',
];

export const DEFAULT_GRADE: GradeLevel = 'grade5';

/** 学段分组（用于年级选择器按小学/初中/高中分组展示） */
export const GRADE_GROUPS: { title: string; grades: GradeLevel[] }[] = [
  { title: '小学', grades: ['grade3', 'grade4', 'grade5', 'grade6'] },
  { title: '初中', grades: ['grade7', 'grade8', 'grade9'] },
  { title: '高中', grades: ['grade10', 'grade11', 'grade12'] },
];

/** 画像里的默认体裁：优先“记事 / 记叙文”，没有就取第一个 */
export function defaultGenre(profile: GradeProfile): string {
  if (profile.genres.includes('记事')) return '记事';
  if (profile.genres.includes('记叙文')) return '记叙文';
  return profile.genres[0];
}

/** 年级切换后，若原体裁不在新年级的体裁列表里，回落到默认体裁 */
export function resolveGenre(profile: GradeProfile, genre: string): string {
  return profile.genres.includes(genre) ? genre : defaultGenre(profile);
}
