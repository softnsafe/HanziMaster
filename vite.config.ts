import { defineConfig } from 'vite';

export default defineConfig({
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
});