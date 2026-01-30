import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      // Provide empty string fallback to avoid "undefined" in code if keys are missing
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL || ''),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': JSON.stringify({})
    },
    build: {
      rollupOptions: {
        // Only externalize React and Google GenAI
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