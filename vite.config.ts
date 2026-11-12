import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 本地大模型（llama.cpp llama-server）代理：解决浏览器跨域，并支持局域网设备访问
const llmProxy = {
  '/api/llm': {
    target: 'http://127.0.0.1:8080',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/llm/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    host: true, // 允许局域网设备（如 iPad、手机）直接访问
    proxy: llmProxy,
  },
  preview: {
    proxy: llmProxy,
  },
})
