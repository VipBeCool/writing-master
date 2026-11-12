export interface AppConfig {
  llmApiUrl: string; // OpenAI 兼容接口地址（本地 llama-server），默认走 Vite 代理
  llmModel: string; // llama-server Router 模式下的主力模型名
  topicApiUrl: string; // 选填：专门用于“盲盒出题”的轻量模型接口地址（留空则共用 llmApiUrl）
  topicModel: string; // 选填：专门用于“盲盒出题”的模型名（留空则默认共用主力模型 llmModel）
  asrApiUrl: string; // 本地 faster-whisper / sensevoice 地址
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const STORAGE_KEY = 'writing_master_app_config';
const CONFIG_VERSION = 3;

export const DEFAULT_MAIN_MODEL = 'Qwen3.5-4B-Q5_K_M';

/** 检测模型是否被当前环境支持（已升级至 llama.cpp build 12317，已原生支持 LFM3 架构） */
export const isUnsupportedModelId = (_modelId?: string): boolean => false;

const DEFAULT_CONFIG: AppConfig = {
  llmApiUrl: '/api/llm/v1',
  llmModel: DEFAULT_MAIN_MODEL,
  topicApiUrl: '',
  topicModel: '',
  asrApiUrl: 'http://localhost:8000/v1/audio/transcriptions',
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export const loadConfig = (): AppConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 升级迁移：清理旧版默认 2B 出题模型或当前 llama.cpp 不支持的 LFM3 模型
      const rawMain = saved.llmModel || DEFAULT_CONFIG.llmModel;
      const safeMain = isUnsupportedModelId(rawMain) ? DEFAULT_MAIN_MODEL : rawMain;
      const rawTopic =
        saved.configVersion !== CONFIG_VERSION && saved.topicModel === 'Qwen3.8-2B-Q5_K_M'
          ? ''
          : (saved.topicModel ?? DEFAULT_CONFIG.topicModel);
      const safeTopic = isUnsupportedModelId(rawTopic) ? '' : rawTopic;

      const next: AppConfig = {
        llmApiUrl: saved.llmApiUrl || DEFAULT_CONFIG.llmApiUrl,
        llmModel: safeMain,
        topicApiUrl: saved.topicApiUrl ?? DEFAULT_CONFIG.topicApiUrl,
        topicModel: safeTopic,
        asrApiUrl: saved.asrApiUrl ?? DEFAULT_CONFIG.asrApiUrl,
        supabaseUrl: saved.supabaseUrl ?? DEFAULT_CONFIG.supabaseUrl,
        supabaseAnonKey: saved.supabaseAnonKey ?? DEFAULT_CONFIG.supabaseAnonKey,
      };
      if (saved.configVersion !== CONFIG_VERSION || safeMain !== rawMain || safeTopic !== rawTopic) {
        saveConfig(next);
      }
      return next;
    }
  } catch (e) {
    console.warn('读取本地配置失败，采用默认值', e);
  }
  return DEFAULT_CONFIG;
};

export const saveConfig = (config: AppConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, configVersion: CONFIG_VERSION }));
  } catch (e) {
    console.error('保存配置失败', e);
  }
};
