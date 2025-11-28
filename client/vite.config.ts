import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // Attach a low-level error handler to prevent ECONNREFUSED stack traces
        // from being printed to the terminal. For connection-refused errors
        // we quietly end the response (or send a small 502) and do not log
        // the full error stack.
        configure: (proxy: any) => {
          proxy.on('error', (err: any, req: any, res: any) => {
            try {
              if (err && err.code === 'ECONNREFUSED') {
                // suppress stack trace and avoid noisy terminal output
                if (res && !res.headersSent) {
                  try {
                    res.writeHead && res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end && res.end('Proxy target refused connection');
                  } catch (e) {
                    // ignore any further errors while sending minimal response
                  }
                } else if (res && typeof res.end === 'function') {
                  try { res.end(); } catch (e) { /* ignore */ }
                }
                return;
              }
            } catch (e) {
              // guard: if our handler throws, fall through to default logger below
            }
            // For other errors, keep the default behavior so they're visible.
            // This prints the error but avoids leaking large stacks for connection
            // refusal which are common during backend restarts.
            console.error(err);
          });
        },
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select'],
          routing: ['react-router-dom'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          icons: ['lucide-react'],
          utils: ['axios', '@tanstack/react-query', 'date-fns']
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // Enable compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: mode === 'production',
      },
    },
  },
}));
