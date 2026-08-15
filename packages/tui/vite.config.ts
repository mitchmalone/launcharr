import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only gallery for eyeballing the kit: `pnpm --filter @launcharr/tui gallery`.
export default defineConfig({
  root: 'gallery',
  plugins: [react()],
  test: {
    root: '.',
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
})
