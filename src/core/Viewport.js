/**
 * 《星际躲避者 (Star Dodger)》视口与高清画布适配模块
 * 负责 Canvas 尺寸自适应、devicePixelRatio (DPR <= 2) 高清缩放及坐标系管理
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp } from '../utils/math.js';

export class Viewport {
  /**
   * @param {HTMLCanvasElement} canvas 目标 Canvas DOM 元素
   * @param {Object} [options] 视口配置参数
   */
  constructor(canvas, options = {}) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('[Viewport] 必须传入有效的 HTMLCanvasElement 实例');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    this.designWidth = options.designWidth || GAME_CONFIG.VIEWPORT.DESIGN_WIDTH;
    this.designHeight = options.designHeight || GAME_CONFIG.VIEWPORT.DESIGN_HEIGHT;
    this.maxDpr = options.maxDpr || GAME_CONFIG.VIEWPORT.MAX_DPR;

    /** @type {number} 当前逻辑宽度（CSS 像素） */
    this.width = 0;

    /** @type {number} 当前逻辑高度（CSS 像素） */
    this.height = 0;

    /** @type {number} 实际生效的设备像素比 (1 ~ 2) */
    this.dpr = 1;

    /** @type {number} 相对于 1920x1080 设计稿的综合缩放比 */
    this.scale = 1;

    /** @type {Set<Function>} 窗口尺寸变更回调集合 */
    this._resizeListeners = new Set();

    this._handleResize = this.resize.bind(this);
    window.addEventListener('resize', this._handleResize, { passive: true });

    // 初始化执行一次尺寸计算
    this.resize();
  }

  /**
   * 重新计算窗口尺寸、DPR 并同步更新 Canvas 物理分辨率与 2D 矩阵
   */
  resize() {
    const rawDpr = window.devicePixelRatio || 1;
    this.dpr = clamp(rawDpr, 1, this.maxDpr);

    this.width = Math.max(320, window.innerWidth);
    this.height = Math.max(240, window.innerHeight);

    // 计算相对 1920x1080 设计尺寸的适配比例
    const scaleX = this.width / this.designWidth;
    const scaleY = this.height / this.designHeight;
    this.scale = Math.min(scaleX, scaleY);

    // 设置 Canvas 物理像素尺寸与 CSS 显示尺寸
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // 重置 2D 上下文缩放矩阵，使绘图 API 保持在清晰的逻辑像素坐标系 (0..width, 0..height)
    this.applyTransform();

    // 通知所有订阅者
    for (const listener of this._resizeListeners) {
      try {
        listener(this.width, this.height, this.dpr, this.scale);
      } catch (err) {
        console.error('[Viewport] resize 监听器回调异常:', err);
      }
    }
  }

  /**
   * 将 Canvas 2D 上下文变换矩阵重置为当前 DPR 缩放状态
   */
  applyTransform() {
    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  /**
   * 清空整个逻辑画布
   */
  clear() {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  /**
   * 注册窗口尺寸变化监听回调
   * @param {(width: number, height: number, dpr: number, scale: number) => void} callback
   * @returns {Function} 取消注册函数
   */
  onResize(callback) {
    if (typeof callback === 'function') {
      this._resizeListeners.add(callback);
    }
    return () => this._resizeListeners.delete(callback);
  }

  /**
   * 销毁视口监听，释放事件绑定
   */
  destroy() {
    window.removeEventListener('resize', this._handleResize);
    this._resizeListeners.clear();
  }
}
