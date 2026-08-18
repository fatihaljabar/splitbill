import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [vue(), tailwindcss()];

  const env = loadEnv(mode, process.cwd(), ['VITE_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_'],
    define: processEnvDefines,
    build: {
      rollupOptions: {
        output: {
          // Rollup's default heuristic splits every module shared by 2+ pages into its
          // own chunk — lucide-vue-next exports one icon per module, so each icon
          // (0.1–0.7 KiB) became a separate file. Under Lighthouse's mobile network
          // throttling this created a long sequential critical-path chain (page chunk →
          // icon → icon → icon…), since the browser only discovers each child import
          // after parsing its parent. Bundling every icon into one chunk turns ~10
          // sequential round-trips into one, cutting the mobile Speed Index gap between
          // FCP/LCP and full paint. Verified: only touches lucide-vue-next, page-level
          // lazy loading (route code-splitting) is untouched.
          manualChunks(id: string) {
            if (id.includes('node_modules/lucide-vue-next')) {
              return 'icons';
            }
          },
        },
      },
    },
  };
});
