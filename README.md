# WritingMaster (作文训练大师前端客户端)

专为小学高段（五年级）打造的语文作文训练助手 Web 客户端，支持 iPad 平板、手机与桌面电脑。

## 技术栈
- **框架**：React 19 + TypeScript
- **构建工具**：Vite 8
- **样式**：Tailwind CSS v4 (护眼暖色调、适合儿童阅读的排版与微交互)
- **图标**：Lucide React
- **动效**：Canvas Confetti (金句收藏激励动效)

## 核心模块
- `src/components/IdeaTrainer.tsx`：思维脚手架训练营（盲盒出题、语音口述构思、AI 点拨诊断、定制示范）
- `src/components/EssayCoach.tsx`：拍照批改与保真升格（手写稿识别、得分卡、流水账诊断、前后段落 Diff 对比）
- `src/components/SampleStudio.tsx`：高分范文馆（题材定制、字数滑块控制、试卷拍照提取、多轮对话润色）
- `src/components/GoldenNotebook.tsx`：金句笔记本（好词好句分类、一键复制、A4 纸排版打印复习单）
- `src/components/SettingsModal.tsx`：本地家庭服务器 Dify、Whisper ASR 与 Supabase 配置

## 本地启动与调试
```bash
# 安装依赖
npm install

# 启动开发服务器（支持局域网 iPad / 手机访问）
npm run dev

# 生产环境打包构建
npm run build
```
