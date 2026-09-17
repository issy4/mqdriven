import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, '.', '');

  // Resolve Supabase credentials from any env var naming convention.
  // Vite only exposes VITE_-prefixed vars to import.meta.env by default,
  // so we must map SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL → VITE_SUPABASE_URL
  // to ensure the client build always has the credentials.
  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_KEY || '';
  const aiOff = env.VITE_AI_OFF || '';

  console.log('Vite env resolution:', {
    SUPABASE_URL: supabaseUrl ? '***SET***' : 'NOT SET',
    SUPABASE_KEY: supabaseKey ? '***SET***' : 'NOT SET',
    GEMINI_API_KEY: 'SERVER_SIDE_ONLY',
    VITE_AI_OFF: aiOff,
  });

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
      'import.meta.env.VITE_AI_OFF': JSON.stringify(aiOff),
    },
    server: {
      port: 8080,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html')
        },
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            charts: ['recharts'],
            icons: ['lucide-react'],
            ai: ['@google/genai'],
            utils: ['uuid', 'jszip']
          }
        }
      },
      minify: 'esbuild',
      cssMinify: false, // Disable CSS minify completely
      chunkSizeWarningLimit: 1000
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@supabase/supabase-js', 'recharts', 'lucide-react', '@google/genai', 'uuid', 'jszip', 'google-auth-library']
    }
  };
});
