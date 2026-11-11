import { defineConfig } from 'vite';

/**
 * Vite 生产与开发配置文件
 * 针对《星际躲避者 (Star Dodger)》v1.0 正式发布版配置相对路径 base: './'，
 * 确保 dist 产物无需开发工具即可部署在任意静态服务器根目录或子目录中直接运行。
 */
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    open: false
  },
  preview: {
    host: true,
    port: 4173,
    open: false
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  }
});
