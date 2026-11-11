/**
 * 《星际躲避者 (Star Dodger)》游戏状态管理模块
 * 统一管理 MENU、PLAYING、PAUSED、GAME_OVER 四大状态流转与状态变更通知：
 * - MENU -> PLAYING
 * - PLAYING -> PAUSED
 * - PAUSED -> PLAYING
 * - PLAYING -> GAME_OVER
 * - GAME_OVER -> PLAYING
 * - GAME_OVER -> MENU
 * - PAUSED -> MENU
 */
import { GAME_STATE } from '../config/gameConfig.js';

export { GAME_STATE };

const ALLOWED_TRANSITIONS = Object.freeze({
  [GAME_STATE.MENU]: [GAME_STATE.PLAYING],
  [GAME_STATE.PLAYING]: [GAME_STATE.PAUSED, GAME_STATE.GAME_OVER, GAME_STATE.MENU, GAME_STATE.PLAYING],
  [GAME_STATE.PAUSED]: [GAME_STATE.PLAYING, GAME_STATE.MENU],
  [GAME_STATE.GAME_OVER]: [GAME_STATE.PLAYING, GAME_STATE.MENU]
});

export class GameStateManager {
  /**
   * @param {string} [initialState=GAME_STATE.MENU] 初始游戏状态（Phase 5 默认进入主菜单 MENU）
   */
  constructor(initialState = GAME_STATE.MENU) {
    this._state = initialState;
    /** @type {Set<Function>} 状态变更监听集合 */
    this._listeners = new Set();
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  get current() {
    return this._state;
  }

  /**
   * 是否处于主菜单状态 (MENU)
   * @returns {boolean}
   */
  isMenu() {
    return this._state === GAME_STATE.MENU;
  }

  /**
   * 是否处于正常进行中状态 (PLAYING)
   * @returns {boolean}
   */
  isPlaying() {
    return this._state === GAME_STATE.PLAYING;
  }

  /**
   * 是否处于暂停状态 (PAUSED)
   * @returns {boolean}
   */
  isPaused() {
    return this._state === GAME_STATE.PAUSED;
  }

  /**
   * 是否处于游戏结束状态 (GAME_OVER)
   * @returns {boolean}
   */
  isGameOver() {
    return this._state === GAME_STATE.GAME_OVER;
  }

  /**
   * 检查是否允许从当前状态流转到目标状态
   * @param {string} nextState
   * @returns {boolean}
   */
  canTransitionTo(nextState) {
    const allowed = ALLOWED_TRANSITIONS[this._state];
    return Array.isArray(allowed) && allowed.includes(nextState);
  }

  /**
   * 切换到目标状态并通知订阅者
   * @param {string} nextState
   * @returns {boolean} 状态是否发生实际改变
   */
  setState(nextState) {
    if (!Object.values(GAME_STATE).includes(nextState)) {
      console.warn(`[GameState] 非法的目标状态: ${nextState}`);
      return false;
    }

    if (this._state === nextState) {
      return false;
    }

    const prevState = this._state;
    this._state = nextState;

    for (const listener of this._listeners) {
      try {
        listener(this._state, prevState);
      } catch (err) {
        console.error('[GameState] 状态变更监听器异常:', err);
      }
    }

    return true;
  }

  /**
   * 监听状态变化
   * @param {(newState: string, oldState: string) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
    return () => this._listeners.delete(callback);
  }

  /**
   * 销毁监听器
   */
  destroy() {
    this._listeners.clear();
  }
}
