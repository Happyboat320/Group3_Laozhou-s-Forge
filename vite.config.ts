/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// PACK=1 时（npm run pack）把所有素材内联进 JS，最后由 tools/pack.mjs 合成一个 index.html。
const pack = process.env.PACK === '1';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
    // 自检脚本会在项目里放 Chrome 配置和 npm 缓存，别让 dev server 去 watch 它们
    watch: { ignored: ['**/.chrome-profile/**', '**/.npm-cache/**', '**/release/**'] },
  },
  build: {
    target: 'es2022',
    outDir: pack ? 'release' : 'dist',
    emptyOutDir: true,
    assetsInlineLimit: pack ? () => true : undefined,
    chunkSizeWarningLimit: pack ? 100_000 : 2_000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // 用线程池而不是 fork：规则测试都是纯逻辑，线程更快，也不依赖子进程权限。
    pool: 'threads',
  },
});
