import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    open: true,
    proxy: {
      '/azure-proxy': {
        target: 'https://eletronica-sem-mimimi.services.ai.azure.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/azure-proxy/, '')
      }
    }
  }
})

