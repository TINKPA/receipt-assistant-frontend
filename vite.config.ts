import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // HTTPS dev server lets iOS Safari grant getUserMedia permission for
  // the Capture viewfinder — Safari refuses on plain-HTTP non-localhost
  // origins. basic-ssl auto-generates a self-signed cert per session;
  // browsers warn once and let you proceed. Opt out by exporting
  // VITE_DEV_HTTPS=false (e.g., for Docker prod which serves HTTPS via
  // nginx in front of the bundle).
  const enableHttps = env.VITE_DEV_HTTPS !== 'false';
  return {
    plugins: [react(), tailwindcss(), ...(enableHttps ? [basicSsl()] : [])],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
