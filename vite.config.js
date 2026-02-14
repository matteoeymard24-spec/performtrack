import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,js}',  // Accepte JSX dans les fichiers .js
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
  esbuild: {
    loader: 'jsx',
    include: /.*\.js$/,  // Traite tous les .js comme du JSX
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',  // Charge les .js comme du JSX
      },
    },
  },
})