/**
 * 《星际躲避者 (Star Dodger)》主循环引擎模块
 * 基于 requestAnimationFrame 与 deltaTime 驱动，支持 start / stop / pause / resume 与失焦保护
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp } from '../utils/math.js';

export class GameLoop {
  /**
   * @param {(deltaTime: number, elapsedTime: number) => void} updateFn 逻辑更新回调
   * @param {(deltaTime: number, elapsedTime: number) => void} renderFn 画面渲染回调
   * @param {Object} [options] 配置选项
   * @param {number} [options.maxDeltaTime=0.1] 最大单帧时间步长（秒）
   */
  constructor(updateFn, renderFn, options = {}) {
    if (typeof updateFn !== 'function' || typeof renderFn !== 'function') {
      throw new TypeError('[GameLoop] updateFn 和 renderFn 必须是有效的函数');
    }

    this._updateFn = updateFn;
    this._renderFn = renderFn;
    this.maxDeltaTime = options.maxDeltaTime ?? GAME_CONFIG.VIEWPORT.MAX_DELTA_TIME ?? 0.1;

    /** @type {boolean} 主循环是否已启动 */
    this.isRunning = false;

    /** @type {boolean} 主循环是否处于暂停状态 */
    this.isPaused = false;

    /** @type {number|null} 当前 requestAnimationFrame 句柄 ID */
    this._rafId = null;

    /** @type {number} 上一帧的高精度时间戳 (ms) */
    this._lastTime = 0;

    /** @type {number} 累计有效运行时间（秒） */
    this.elapsedTime = 0;

    /** @type {number} 当前估算帧率 (FPS) */
    this.fps = 60;

    /** @type {boolean} 标记页面从后台/失焦恢复后是否需要重置时间戳 */
    this._needsTimeReset = false;

    this._tick = this._tick.bind(this);
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    this._handleWindowBlur = this._handleWindowBlur.bind(this);
    this._handleWindowFocus = this._handleWindowFocus.bind(this);

    this._bindLifecycleEvents();
  }

  /**
   * 绑定浏览器页面可见性与窗口焦点事件，防止切后台回来产生巨大时间跳变
   */
  _bindLifecycleEvents() {
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    window.addEventListener('blur', this._handleWindowBlur);
    window.addEventListener('focus', this._handleWindowFocus);
  }

  /**
   * 处理页面可见性变化
   */
  _handleVisibilityChange() {
    if (document.hidden) {
      this._needsTimeReset = true;
    } else {
      this._needsTimeReset = true;
      this._lastTime = performance.now();
    }
  }

  /**
   * 处理窗口失焦
   */
  _handleWindowBlur() {
    this._needsTimeReset = true;
  }

  /**
   * 处理窗口重新获得焦点
   */
  _handleWindowFocus() {
    this._needsTimeReset = true;
    this._lastTime = performance.now();
  }

  /**
   * 启动主循环（自带防重复启动保护）
   */
  start() {
    if (this.isRunning) {
      // 如果已在运行但处于暂停状态，则执行恢复
      if (this.isPaused) {
        this.resume();
      }
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this._needsTimeReset = false;
    this._lastTime = performance.now();

    this._scheduleNextFrame();
  }

  /**
   * 停止主循环并清理动画帧句柄
   */
  stop() {
    this.isRunning = false;
    this.isPaused = false;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * 暂停主循环（冻结逻辑更新但保留运行状态标记）
   */
  pause() {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.isPaused = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /**
   * 从暂停状态恢复主循环
   */
  resume() {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    this._needsTimeReset = false;
    this._lastTime = performance.now();

    this._scheduleNextFrame();
  }

  /**
   * 安全调度下一帧（严格保证同一时刻最多只有一个 RAF 队列）
   */
  _scheduleNextFrame() {
    if (!this.isRunning || this.isPaused) {
      return;
    }
    if (this._rafId !== null) {
      return;
    }
    this._rafId = requestAnimationFrame(this._tick);
  }

  /**
   * 单帧执行回调
   * @param {number} timestamp 当前帧时间戳 (ms)
   */
  _tick(timestamp) {
    this._rafId = null;

    if (!this.isRunning || this.isPaused) {
      return;
    }

    // 处理失焦恢复后的首帧时间戳对齐
    if (this._needsTimeReset) {
      this._lastTime = timestamp;
      this._needsTimeReset = false;
    }

    const rawDeltaSeconds = (timestamp - this._lastTime) / 1000;
    this._lastTime = timestamp;

    // 限制 deltaTime 在 [0, maxDeltaTime] (0.1s) 范围内
    const deltaTime = clamp(rawDeltaSeconds, 0, this.maxDeltaTime);

    if (deltaTime > 0) {
      const instantFps = 1 / deltaTime;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
    }

    this.elapsedTime += deltaTime;

    // 执行逻辑更新与渲染
    this._updateFn(deltaTime, this.elapsedTime);
    this._renderFn(deltaTime, this.elapsedTime);

    // 继续调度下一帧
    this._scheduleNextFrame();
  }

  /**
   * 销毁主循环并移除全局事件监听
   */
  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    window.removeEventListener('blur', this._handleWindowBlur);
    window.removeEventListener('focus', this._handleWindowFocus);
  }
}
