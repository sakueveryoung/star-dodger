/**
 * 《星际躲避者 (Star Dodger)》玩家生命值与受击无敌帧管理模块
 * 职责：
 * 1. 初始化并维护 3 格生命值（下限严格为 0，上限为 maxHealth）
 * 2. 提供 takeDamage() 方法：每次有效受击减少 1 格生命并激活 1.2 秒无敌保护时间
 * 3. 无敌期间免疫后续碰撞伤害，杜绝连续帧重复扣血
 * 4. 提供 isDead() 状态查询及 onDamage / onDeath / onHealthChange 事件订阅
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp } from '../utils/math.js';

export class PlayerHealth {
  /**
   * @param {Object} [options] 配置项
   * @param {number} [options.initialHealth=3] 初始生命值
   * @param {number} [options.maxHealth=3] 最大生命值
   * @param {number} [options.invincibleDuration=1.2] 受击后无敌时间（秒）
   */
  constructor(options = {}) {
    const cfg = GAME_CONFIG.PLAYER;

    this.maxHealth = options.maxHealth ?? cfg.MAX_HEALTH ?? 3;
    this.initialHealth = clamp(options.initialHealth ?? cfg.INITIAL_HEALTH ?? 3, 1, this.maxHealth);
    this.invincibleDuration = options.invincibleDuration ?? cfg.INVINCIBLE_DURATION ?? 1.2;

    /** @type {number} 当前剩余生命值 (0 ~ maxHealth) */
    this.currentHealth = this.initialHealth;

    /** @type {number} 剩余无敌时间（秒） */
    this.invincibleTimer = 0;

    /** @type {Set<Function>} 受击事件回调集合 */
    this._damageListeners = new Set();

    /** @type {Set<Function>} 死亡事件回调集合 */
    this._deathListeners = new Set();

    /** @type {Set<Function>} 生命值变化回调集合 */
    this._changeListeners = new Set();
  }

  /**
   * 当前是否处于受击后无敌保护状态
   * @returns {boolean}
   */
  get isInvincible() {
    return this.invincibleTimer > 0;
  }

  /**
   * 判断玩家生命值是否已归零死亡
   * @returns {boolean}
   */
  isDead() {
    return this.currentHealth <= 0;
  }

  /**
   * 执行受击扣血判定
   * - 若已死亡或正处于 1.2 秒无敌时间内，则忽略本次伤害并返回 false
   * - 若有效受击，则扣除 1 格生命（最低为 0），启动 1.2 秒无敌计时并触发回调
   * @param {number} [amount=1] 伤害值，默认 1 格
   * @param {Object} [context={}] 碰撞上下文信息
   * @returns {boolean} 本次受击是否实际生效扣血
   */
  takeDamage(amount = 1, context = {}) {
    if (this.isDead() || this.isInvincible) {
      return false;
    }

    const damage = Math.max(1, Math.floor(amount));
    const previousHealth = this.currentHealth;
    this.currentHealth = Math.max(0, this.currentHealth - damage);

    const payload = {
      previousHealth,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      damage,
      invincibleDuration: this.invincibleDuration,
      ...context
    };

    // 若生命值仍大于 0，开启 1.2 秒无敌时间；若已归零则进入死亡状态
    if (this.currentHealth > 0) {
      this.invincibleTimer = this.invincibleDuration;
    } else {
      this.invincibleTimer = 0;
    }

    this._emitChange(payload);
    this._emitDamage(payload);

    if (this.isDead()) {
      this._emitDeath(payload);
    }

    return true;
  }

  /**
   * 随 deltaTime 更新无敌倒计时
   * @param {number} deltaTime 帧间隔（秒）
   */
  update(deltaTime) {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - deltaTime);
    }
  }

  /**
   * 重新初始化生命值与无敌状态（供重新开始游戏调用）
   */
  reset() {
    this.currentHealth = this.initialHealth;
    this.invincibleTimer = 0;
    this._emitChange({
      previousHealth: this.currentHealth,
      currentHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      damage: 0,
      invincibleDuration: 0
    });
  }

  /**
   * 订阅有效受击事件
   * @param {(payload: Object) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onDamage(callback) {
    if (typeof callback === 'function') {
      this._damageListeners.add(callback);
    }
    return () => this._damageListeners.delete(callback);
  }

  /**
   * 订阅生命归零死亡事件
   * @param {(payload: Object) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onDeath(callback) {
    if (typeof callback === 'function') {
      this._deathListeners.add(callback);
    }
    return () => this._deathListeners.delete(callback);
  }

  /**
   * 订阅生命值变化事件（用于 HUD 血格实时刷新）
   * @param {(payload: Object) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onHealthChange(callback) {
    if (typeof callback === 'function') {
      this._changeListeners.add(callback);
    }
    return () => this._changeListeners.delete(callback);
  }

  _emitDamage(payload) {
    for (const cb of this._damageListeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[PlayerHealth] onDamage 回调异常:', err);
      }
    }
  }

  _emitDeath(payload) {
    for (const cb of this._deathListeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[PlayerHealth] onDeath 回调异常:', err);
      }
    }
  }

  _emitChange(payload) {
    for (const cb of this._changeListeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[PlayerHealth] onHealthChange 回调异常:', err);
      }
    }
  }

  /**
   * 销毁所有事件监听器
   */
  destroy() {
    this._damageListeners.clear();
    this._deathListeners.clear();
    this._changeListeners.clear();
  }
}
