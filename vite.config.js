import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Keep App.vue untouched while the dynamic movement checkout replaces the legacy view.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: './views/MovementView.vue',
        replacement: fileURLToPath(new URL('./src/views/MovementViewDynamic.vue', import.meta.url))
      }
    ]
  }
})
