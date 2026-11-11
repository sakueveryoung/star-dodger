/**
 * 《星际躲避者 (Star Dodger)》键盘与触控输入管理器 (Phase 6 增强版)
 * 负责监听 PC 键盘 WASD、上下左右方向键、P 键与 Escape 键（最高优先级），
 * 同时提供非侵入式移动端/触控拖拽方向控制支持，提供按键状态查询与归一化移动向量。
 */
import { normalizeVector } from '../utils/math.js';

/**
 * 逻辑动作与物理按键码 (event.code / event.key) 映射表
 */
export const INPUT_ACTIONS = {
  UP: ['KeyW', 'ArrowUp', 'w', 'W'],
  DOWN: ['KeyS', 'ArrowDown', 's', 'S'],
  LEFT: ['KeyA', 'ArrowLeft', 'a', 'A'],
  RIGHT: ['KeyD', 'ArrowRight', 'd', 'D'],
  PAUSE: ['KeyP', 'Escape', 'p', 'P']
};

export class InputManager {
  constructor() {
    /** @type {Set<string>} 当前处于按下状态的按键集合 */
    this._pressedKeys = new Set();

    /** @type {Set<Function>} 暂停动作触发回调集合 */
    this._pauseCallbacks = new Set();

    /** @type {boolean} 事件监听器是否已挂载 */
    this._isAttached = false;

    /** @type {boolean} 是否有激活中的触控滑动输入 */
    this._touchActive = false;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchCurrentX = 0;
    this._touchCurrentY = 0;

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
    this._handleWindowBlur = this._handleWindowBlur.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);

    this.attach();
  }

  /**
   * 注册全局键盘、触控与焦点监听事件（幂等操作，防重复注册）
   */
  attach() {
    if (this._isAttached || typeof window === 'undefined') {
      return;
    }
    window.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('keyup', this._handleKeyUp);
    window.addEventListener('blur', this._handleWindowBlur);
    window.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this._handleTouchMove, { passive: true });
    window.addEventListener('touchend', this._handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this._handleTouchEnd, { passive: true });
    this._isAttached = true;
  }

  /**
   * 处理键盘按下事件
   * @param {KeyboardEvent} event
   */
  _handleKeyDown(event) {
    const { code, key, repeat } = event;

    // 阻止方向键滚动页面的默认行为
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    ) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }

    this._pressedKeys.add(code);
    if (key) {
      this._pressedKeys.add(key);
    }

    // 处理单次触发动作（P 或 Escape 键，忽略长按自动重复触发）
    if (!repeat && this._matchesAction(code, key, INPUT_ACTIONS.PAUSE)) {
      for (const callback of this._pauseCallbacks) {
        try {
          callback(event);
        } catch (err) {
          console.error('[InputManager] 暂停快捷键回调异常:', err);
        }
      }
    }
  }

  /**
   * 处理键盘抬起事件
   * @param {KeyboardEvent} event
   */
  _handleKeyUp(event) {
    const { code, key } = event;
    this._pressedKeys.delete(code);
    if (key) {
      this._pressedKeys.delete(key);
    }
  }

  /**
   * 处理触控按下（忽略 UI 按钮/控件上的点击）
   * @param {TouchEvent} event
   */
  _handleTouchStart(event) {
    if (!event.touches || event.touches.length === 0) return;
    const target = event.target;
    if (target && typeof target.closest === 'function') {
      if (target.closest('button, input, .sci-btn, .sci-modal')) {
        return;
      }
    }
    const touch = event.touches[0];
    this._touchActive = true;
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
    this._touchCurrentX = touch.clientX;
    this._touchCurrentY = touch.clientY;
  }

  /**
   * 处理触控拖拽移动
   * @param {TouchEvent} event
   */
  _handleTouchMove(event) {
    if (!this._touchActive || !event.touches || event.touches.length === 0) return;
    const touch = event.touches[0];
    this._touchCurrentX = touch.clientX;
    this._touchCurrentY = touch.clientY;
  }

  /**
   * 处理触控结束
   */
  _handleTouchEnd() {
    this._touchActive = false;
  }

  /**
   * 窗口失焦时自动清空所有按下状态，防止切屏卡键
   */
  _handleWindowBlur() {
    this.reset();
  }

  /**
   * 校验按键是否匹配目标动作键列表
   * @param {string} code
   * @param {string} key
   * @param {string[]} keyList
   * @returns {boolean}
   */
  _matchesAction(code, key, keyList) {
    return keyList.includes(code) || keyList.includes(key);
  }

  /**
   * 查询指定按键码或键值是否处于按下状态
   * @param {string} codeOrKey 例如 'KeyW'、'ArrowUp'、'Escape'
   * @returns {boolean}
   */
  isKeyDown(codeOrKey) {
    return this._pressedKeys.has(codeOrKey);
  }

  /**
   * 查询指定逻辑动作是否处于激活状态
   * @param {'UP'|'DOWN'|'LEFT'|'RIGHT'|'PAUSE'} actionName
   * @returns {boolean}
   */
  isActionActive(actionName) {
    const keys = INPUT_ACTIONS[actionName];
    if (!keys) {
      return false;
    }
    for (let i = 0; i < keys.length; i++) {
      if (this._pressedKeys.has(keys[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取当前移动方向归一化向量（PC 键盘优先；无键盘输入时支持触控虚拟摇杆方向）
   * @returns {{x: number, y: number, length: number}}
   */
  getMovementVector() {
    let rawX = 0;
    let rawY = 0;

    if (this.isActionActive('LEFT')) rawX -= 1;
    if (this.isActionActive('RIGHT')) rawX += 1;
    if (this.isActionActive('UP')) rawY -= 1;
    if (this.isActionActive('DOWN')) rawY += 1;

    if (rawX !== 0 || rawY !== 0) {
      return normalizeVector(rawX, rawY);
    }

    if (this._touchActive) {
      const dx = this._touchCurrentX - this._touchStartX;
      const dy = this._touchCurrentY - this._touchStartY;
      const deadZone = 10;
      if (dx * dx + dy * dy > deadZone * deadZone) {
        return normalizeVector(dx, dy);
      }
    }

    return normalizeVector(0, 0);
  }

  /**
   * 注册 P / Escape 暂停键按下监听
   * @param {(event: KeyboardEvent) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onPauseToggle(callback) {
    if (typeof callback === 'function') {
      this._pauseCallbacks.add(callback);
    }
    return () => this._pauseCallbacks.delete(callback);
  }

  /**
   * 清空当前所有按键与触控状态
   */
  reset() {
    this._pressedKeys.clear();
    this._touchActive = false;
  }

  /**
   * 销毁输入管理器，解绑全部 DOM 事件监听
   */
  destroy() {
    if (this._isAttached && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._handleKeyDown);
      window.removeEventListener('keyup', this._handleKeyUp);
      window.removeEventListener('blur', this._handleWindowBlur);
      window.removeEventListener('touchstart', this._handleTouchStart);
      window.removeEventListener('touchmove', this._handleTouchMove);
      window.removeEventListener('touchend', this._handleTouchEnd);
      window.removeEventListener('touchcancel', this._handleTouchEnd);
      this._isAttached = false;
    }
    this._pressedKeys.clear();
    this._pauseCallbacks.clear();
    this._touchActive = false;
  }
}
