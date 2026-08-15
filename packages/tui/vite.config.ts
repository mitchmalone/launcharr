import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only workbench for state-testing the kit: `pnpm --filter @launcharr/tui workbench`.
export default defineConfig({
  root: 'workbench',
  plugins: [react()],
  test: {
    root: '.',
    exclude: ['**/node_modules/**', '**/.claude/**'],
  },
})
