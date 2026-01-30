import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      // Replaces process.env.API_KEY with the actual string value during build
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(env.REACT_APP_BACKEND_URL),
      // Polyfill process.env to prevent "process is not defined" error in the browser
      'process.env': {}
    },
    build: {
      rollupOptions: {
        // external: Tells Vite/Rollup NOT to bundle these libraries.
        // They will be resolved at runtime via the importmap in index.html.
        external: [
          'react',
          'react/jsx-runtime',
          'react-dom',
          'react-dom/client',
          '@google/genai',
          'recharts'
        ]
      }
    },
    esbuild: {
      // Forces the compiler to use React.createElement instead of importing 
      // the automatic runtime (react/jsx-runtime), which was causing the error.
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    }
  };
});