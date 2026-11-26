/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Config Vite : React + Tailwind v4 + alias @ + Vitest (jsdom)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // PORT est injecté par les previews (agents) ; 5173 sinon.
    port: Number(process.env.PORT) || 5173,
    // Proxy /api → backend (docker compose : API_PROXY_TARGET=http://backend:8000,
    // VITE_API_URL vide). Les appels restent same-origin : pas de CORS, et pas
    // d'upgrade HTTPS forcé par Safari sur un autre port de localhost.
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
