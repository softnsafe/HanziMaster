
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    // Base public path when served in development or production.
    // Setting this to './' allows the app to be deployed to any subdirectory (e.g., GitHub Pages).
    base: './', 
    define: {
      // Provide empty string fallback for specific keys to prevent crashes
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Minify output for production
      minify: 'esbuild',
    },
    esbuild: {
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    }
  };
});
