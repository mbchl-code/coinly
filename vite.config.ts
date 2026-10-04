import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // host + allowedHosts — чтобы открывать dev-сервер через туннель (cloudflared/ngrok) из Telegram
  server: { host: true, allowedHosts: true },
})
