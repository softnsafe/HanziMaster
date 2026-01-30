import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Provide empty string fallback for specific keys to prevent crashes
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      rollupOptions: {
        // Externalize dependencies loaded via CDN/importmap
        external: [
          'react',
          'react/jsx-runtime',
          'react-dom',
          'react-dom/client',
          '@google/genai'
        ]
      }
    },
    esbuild: {
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    }
  };
});