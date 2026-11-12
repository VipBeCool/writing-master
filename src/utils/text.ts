import type { GoldenSnippetTag } from '../types';

/** 好词好句本的 8 大核心作文素材分类（按中小学写作高频技法排列） */
export const SNIPPET_TAGS: GoldenSnippetTag[] = [
  '外貌神态',
  '动作细节',
  '语言对话',
  '心理刻画',
  '景物描写',
  '修辞佳句',
  '开头结尾',
  '哲理升华',
];

/**
 * 根据选中的好句子（及可选的全文上下文或技巧批注），自动识别最匹配的分类标签。
 * 解决以往收藏时默认全是“未分类”或写死成“心理刻画”的问题。
 */
export function inferSnippetTag(
  sentence: string,
  fullEssay?: string,
  hintTechnique?: string
): GoldenSnippetTag {
  const s = sentence.trim();
  const hint = (hintTechnique || '').trim();

  // 1. 若有 AI 给出的明确技法批注（如“【动作描写】：…”），优先按批注归类
  if (hint) {
    if (/外貌|肖像|神态|表情|眼神/.test(hint)) return '外貌神态';
    if (/动作|动词|慢镜头/.test(hint)) return '动作细节';
    if (/语言|对话|语气|声/.test(hint)) return '语言对话';
    if (/心理|内心|情感|感受/.test(hint)) return '心理刻画';
    if (/景物|环境|五感|风光|气氛/.test(hint)) return '景物描写';
    if (/比喻|拟人|排比|修辞|通感|夸张/.test(hint)) return '修辞佳句';
    if (/开头|结尾|首尾|点题/.test(hint)) return '开头结尾';
    if (/哲理|升华|立意|感悟|深化/.test(hint)) return '哲理升华';
  }

  // 2. 语言对话特征：包含人物说话引号与言语提示词
  if (/[“"「].+[”"」]/.test(s) && /(?:说|喊|叫|道|问|答|嚷|叮嘱|唠叨|脱口而出|小声|大声|嗓门|声音)/.test(s)) {
    return '语言对话';
  }

  // 3. 哲理升华特征：包含点明道理、成长感悟的标志词
  if (/(?:明白了|懂得了|告诉我|让我明白|原来.+是|人生|岁月|生命|成长就是|真谛|永远留在|只要.+就一定|温暖着我)/.test(s)) {
    return '哲理升华';
  }

  // 4. 心理刻画特征：内心活动、情绪波动与感官紧张
  if (/(?:心里|心头|心想|暗想|心弦|忐忑|犹豫|后悔|愧疚|羞愧|紧张得|手心攥汗|怦怦直跳|小鹿乱撞|五味杂陈|鼻子一酸|眼眶一热|暗下决心|恨不得)/.test(s)) {
    return '心理刻画';
  }

  // 5. 景物描写特征：自然风物、光影天气、四季草木
  if (
    /(?:阳光|月光|星光|晚霞|晨雾|微风|秋风|春风|雨点|雨丝|雪花|天空|云朵|树叶|银杏|荷叶|花瓣|湖面|水面|溪水|田野|远山|草丛|泥土|清香|芬芳)/.test(s) &&
    !/(?:妈妈|爸爸|爷爷|奶奶|外婆|外公|老师|同桌)/.test(s)
  ) {
    return '景物描写';
  }

  // 6. 外貌神态特征：眉眼、神情、面容、穿戴特征
  if (/(?:眼睛|眼神|目光|眼角|眉头|眉毛|脸庞|脸颊|笑脸|嘴角|笑容|皱纹|白发|银丝|身材|背影|穿着|戴着|神情|脸色)/.test(s)) {
    return '外貌神态';
  }

  // 7. 动作细节特征：连续动作与肢体细节
  if (/(?:伸出|捧起|抓起|握住|攥着|拍了拍|挠挠头|踮起|弯下腰|蹲下|冲过去|跑过去|扑过来|飞快地|小心翼翼地|轻轻地|用力地|擦拭|翻开|端来)/.test(s)) {
    return '动作细节';
  }

  // 8. 修辞佳句特征：鲜明的比喻、拟人、排比句式
  if (/(?:像.+一样|就像|好似|仿佛|宛如|犹如|像个|成了.+的|跳起了舞|唱起了歌|露出了笑脸)/.test(s)) {
    return '修辞佳句';
  }

  // 9. 判断是否处于全文首段第一句或末段最后一句（开头结尾）
  if (fullEssay) {
    const paras = splitEssayParagraphs(fullEssay);
    if (paras.length >= 2) {
      const firstPara = paras[0];
      const lastPara = paras[paras.length - 1];
      if (firstPara.startsWith(s) || lastPara.endsWith(s)) {
        return '开头结尾';
      }
    }
  }

  return '修辞佳句';
}

/**
 * 清理粘贴进来的文字：去掉空行、每行首尾的空白（含全角空格缩进）。
 * 若 indentParagraphs 为 true（用于作文稿纸正文框），则为每个自然段开头统一补齐两个全角空格（　　）。
 */
export function cleanPastedText(text: string, indentParagraphs = false): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))
    .filter(Boolean);
  if (!indentParagraphs) return lines.join('\n');
  return lines.map((line) => `\u3000\u3000${line}`).join('\n');
}

/**
 * 去掉每一自然段开头的空白与全角空格缩进（用于不需要首行缩进的普通表单文本框，如“改一改”左侧输入框）。
 */
export function stripDraftIndent(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[\s\u3000]+/, ''))
    .join('\n');
}

export interface EssayCompletenessInfo {
  charCount: number;
  paraCount: number;
  targetWords: number;
  shortfall: number;
  endsWithPunct: boolean;
  /** 是否明显没写完（字数不足一半、或只有 1 段、或末尾连句末标点都没有） */
  isUnfinished: boolean;
  /** 虽有基本段落，但字数仍明显未达标（差 25 字以上） */
  isUnderLength: boolean;
  /** 具体的完篇/篇幅问题列表 */
  issues: string[];
}

/**
 * 检测学生提交的作文是否“没写完 / 结构残缺 / 字数严重不足”，供批改诊断与界面提示使用。
 */
export function analyzeEssayCompleteness(essay: string, targetWords: number): EssayCompletenessInfo {
  const trimmed = essay.trim();
  const charCount = trimmed.replace(/\s/g, '').length;
  const paragraphs = splitEssayParagraphs(trimmed);
  const paraCount = paragraphs.length;
  const shortfall = Math.max(0, targetWords - charCount);
  const endsWithPunct = charCount === 0 ? false : /[。！？!?…”"」』）~～]$/.test(trimmed);

  const isUnfinished =
    charCount < Math.round(targetWords * 0.55) ||
    paraCount <= 1 ||
    !endsWithPunct ||
    (paraCount === 2 && charCount < Math.round(targetWords * 0.75));

  const isUnderLength = !isUnfinished && shortfall > 25;

  const issues: string[] = [];
  if (shortfall > 20) {
    if (charCount < Math.round(targetWords * 0.55)) {
      issues.push(`篇幅严重不足（当前仅 ${charCount} 字，本年级要求不少于 ${targetWords} 字，还差 ${shortfall} 字）`);
    } else {
      issues.push(`字数尚未达标（当前 ${charCount} 字，距离本年级要求的 ${targetWords} 字还差 ${shortfall} 字）`);
    }
  }
  if (paraCount <= 1) {
    issues.push('全文只有 1 个自然段，目前仅写了一个开头片段，缺少中间具体事例展开段和结尾收束段，文章结构不完整');
  } else if (paraCount === 2 && charCount < Math.round(targetWords * 0.8)) {
    issues.push('全文只有 2 个自然段，缺少“开头引入—中间事例细节展开—结尾点题升华”的完整篇章结构');
  }
  if (!endsWithPunct && charCount > 0) {
    const tail = trimmed.slice(-10);
    issues.push(`文章末尾停在“${tail}”，连句号等结束标点都没有，话还没说完就中断了`);
  }

  return {
    charCount,
    paraCount,
    targetWords,
    shortfall,
    endsWithPunct,
    isUnfinished,
    isUnderLength,
    issues,
  };
}

/**
 * 保证正在编写的作文草稿每一自然段开头都有两个全角空格（　　）。
 * 若全文除了空白字符外没有任何实际内容，则返回空字符串。
 */
export function normalizeDraftIndent(text: string): string {
  if (!text || !text.replace(/[\s\u3000]/g, '')) return '';
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  return rawLines
    .map((line) => {
      const stripped = line.replace(/^[\s\u3000]+/, '');
      return `\u3000\u3000${stripped}`;
    })
    .join('\n');
}

/**
 * 根据用户手动输入的作文题目，智能推断最匹配的体裁（仅在题目特征非常明确时返回，否则返回 null）。
 * 解决人工输入标题（如《第一次悄悄说再见》）但忘了切换体裁按钮（仍停留在“写人”）的问题。
 */
export function inferGenreFromTitle(title: string, availableGenres: string[]): string | null {
  const t = title.replace(/[\s《》“”"'‘’]/g, '').trim();
  if (t.length < 2) return null;

  const pick = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      if (availableGenres.includes(c)) return c;
    }
    return null;
  };

  // 1. 读后感特征
  if (/^读.+有感$|有感$|带给我的启示$|的启示$|^品读|^合上/.test(t)) {
    return pick('读后感', '议论文', '记叙文');
  }

  // 2. 想象特征
  if (/^(?:假如|如果|倘若)|(?:二十年后|三十年后|一百年后|未来的)|(?:奇遇记|历险记|奇幻之旅|变形记|夜半争吵|开口说话|的自述)$/.test(t)) {
    return pick('想象', '记叙文');
  }

  // 3. 议论文 / 时评特征
  if (/^(?:谈谈|谈|论|浅谈|何以|莫让|唯有|也说)|(?:的意义|的价值|之我见|的启示|与.+)$/.test(t)) {
    if (availableGenres.includes('议论文') && !availableGenres.includes('记事')) {
      return pick('议论文', '材料作文', '时评');
    }
  }

  // 4. 记事特征（以“第一次…”“那次…”“一件…事”开头，或以事件/动作结尾）
  if (
    /^(?:第一次|那一次|那次|记一次|难忘的一次|今天我|那天我)/.test(t) ||
    /(?:说再见|的一件事|的趣事|的傻事|的秘密|的约定|的教训|的掌声|的比赛|拔河|接力赛|运动会|风波|争吵|道歉|尝试|挑战|之旅|经历|那一天|的午后|的夜晚)$/.test(t)
  ) {
    return pick('记事', '记叙文');
  }

  // 5. 写景特征（自然风光、四季、朝暮、天气、场所景色）
  if (
    /(?:的春天|的夏天|的秋天|的冬天|的四季|春色|夏夜|秋色|冬景|日出|晚霞|星空|雨后|彩虹桥|初雪|晨雾|小院|校园的.+|公园的.+|美丽的.+|迷人的.+|家乡的河|小树林|银杏林|荷塘)$/.test(t) &&
    !/妈|爸|爷|奶|公|婆|老师|同桌|朋友/.test(t)
  ) {
    return pick('写景', '散文', '记叙文');
  }

  // 6. 状物特征（动植物、文具、玩具、心爱之物、老物件）
  if (
    /(?:小猫|橘猫|小狗|小乌龟|小仓鼠|小金鱼|小兔子|鹦鹉|蜗牛|蚂蚁|绿萝|多肉|仙人掌|向日葵|蒲公英|桂花|梅花|文具盒|小闹钟|书包|钢笔|地球仪|八音盒|老蒲扇|老花镜|紫砂壶)$/.test(t)
  ) {
    return pick('状物', '说明文', '散文');
  }

  // 7. 写人特征（中心词是人物称谓、角色或绰号）
  if (
    /(?:妈妈|爸爸|老爸|老妈|爷爷|奶奶|外公|外婆|姥姥|姥爷|叔叔|阿姨|哥哥|姐姐|弟弟|妹妹|老师|班主任|同桌|同学|好朋友|伙伴|邻居|大爷|大叔|师傅|保安|快递员|环卫工|小书虫|智多星|大王|达人|老顽童|热心肠|慢性子|急性子)$/.test(t)
  ) {
    return pick('写人', '记叙文');
  }

  return null;
}

/**
 * 把作文正文拆分成干净的自然段：
 * 自动剔除模型或输入文本自带的段落首尾空格（含全角空格），避免与排版缩进叠成四格。
 */
export function splitEssayParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))
    .filter(Boolean);
}

/**
 * 格式化用于复制到剪贴板的完整作文：
 * 标题居中/独立成行后，每个自然段开头统一加上两个全角空格（　　），方便粘贴到 Word 或微信展示。
 */
export function formatEssayForCopy(title: string, content: string): string {
  const paragraphs = splitEssayParagraphs(content).map((p) => `\u3000\u3000${p}`);
  return `${title.trim()}\n\n${paragraphs.join('\n')}`;
}
