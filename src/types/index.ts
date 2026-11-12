// 年级与年级画像见 src/data/gradeProfiles.ts（三年级 ~ 高三）
export type { GradeLevel } from '../data/gradeProfiles';

// 思维脚手架训练状态
export interface IdeaTrainingSession {
  id: string;
  topic: string;
  topicCategory: string; // 体裁，取值来自当前年级画像的 genres
  userOutlineVoiceText: string; // 孩子口述的大纲思路
  aiFeedback: {
    praise: string; // 肯定孩子的闪光点
    scaffoldingQuestions: string[]; // 启发式问题，引导细节
    keyTips: string; // 提分点拨
  };
  generatedDraft: {
    title: string;
    content: string;
    wordCount: number;
    structure: {
      beginning: string;
      body: string;
      ending: string;
    };
    goldenSentences: string[];
  };
  createdAt: string;
}

// 批改与改写
export interface CorrectionReport {
  id: string;
  originalTitle: string;
  originalContent: string;
  originalImageUri?: string;
  score: {
    total: number; // 满分 50
    structure: number;
    wording: number;
    emotion: number;
  };
  diagnostics: {
    typosAndGrammar: Array<{ error: string; fix: string; reason: string }>;
    runOnSentenceWarning: string[]; // 流水账预警
    goodPoints: string[];
    improvementSuggestions: string[];
  };
  upgradedEssay: {
    title: string;
    content: string;
    wordCount: number;
  };
  diffComparisons: Array<{
    originalExcerpt: string;
    upgradedExcerpt: string;
    technique: string; // 比如：增加心理描写、动词细化、环境烘托
  }>;
  createdAt: string;
}

// 金句摘抄（覆盖中小学作文五大人物描写 + 环境修辞 + 凤头豹尾 + 点题哲理）
export type GoldenSnippetTag =
  | '未分类'
  | '外貌神态'
  | '动作细节'
  | '语言对话'
  | '心理刻画'
  | '景物描写'
  | '修辞佳句'
  | '开头结尾'
  | '哲理升华';

export interface GoldenSnippet {
  id: string;
  text: string;
  sourceTitle: string;
  tag: GoldenSnippetTag;
  explanation: string;
  createdAt: string;
}

// 学生正在写的作文草稿（“写一写”和“改一改”共用，保存在本机）
export interface EssayDraft {
  title: string;
  content: string;
  genre: string;
}

// 收藏的好文章（范文、示范成文、升格作文、修改稿）
export type SavedEssayKind = '范文' | '示范成文' | '升格作文' | '修改稿';

export interface SavedEssay {
  id: string;
  title: string;
  content: string;
  genre: string;
  gradeName: string;
  kind: SavedEssayKind;
  wordCount: number;
  createdAt: string;
}

// 盲盒题目历史记录
export interface TopicHistoryItem {
  id: string;
  topic: string;
  genre: string;
  tip: string;
  gradeName: string;
  source: 'ai' | 'builtin';
  createdAt: string;
}
