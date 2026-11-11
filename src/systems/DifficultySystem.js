/**
 * 《星际躲避者 (Star Dodger)》动态难度递增系统
 * 职责：
 * 1. 初始难度为 LV.1，每生存 20 秒提升 1 级难度
 * 2. 动态计算陨石生成间隔：
 *    LV.1: 1.4s -> LV.2: 1.3s -> LV.3: 1.2s -> LV.4: 1.1s -> LV.5: 1.0s
 *    100秒后继续按每级递减 0.1s，直至下限 0.6s
 * 3. 动态计算新生成陨石的移动速度倍率（上限 2.0x，保证高难度依然具备可玩性）
 * 4. 仅将参数同步给 SpawnSystem 用于后续新生成的陨石，绝不突变已在屏幕中的陨石速度
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp } from '../utils/math.js';

export class DifficultySystem {
  constructor() {
    const diffCfg = GAME_CONFIG.DIFFICULTY;
    const meteorCfg = GAME_CONFIG.METEOR;

    this.initialLevel = diffCfg.INITIAL_LEVEL || 1;
    this.levelUpInterval = diffCfg.LEVEL_UP_INTERVAL || 20.0;
    this.baseSpawnInterval = meteorCfg.BASE_SPAWN_INTERVAL || 1.4;
    this.intervalStep = diffCfg.INTERVAL_STEP_PER_LEVEL || 0.1;
    this.minSpawnInterval = diffCfg.MIN_SPAWN_INTERVAL || meteorCfg.MIN_SPAWN_INTERVAL || 0.6;
    this.speedStep = diffCfg.SPEED_MULTIPLIER_PER_LEVEL || 0.12;
    this.maxSpeedMultiplier = diffCfg.MAX_SPEED_MULTIPLIER || 2.0;

    /** @type {number} 当前难度等级 (LV.1 起) */
    this.level = this.initialLevel;

    /** @type {number} 当前等级对应的陨石基准生成间隔（秒） */
    this.spawnInterval = this.baseSpawnInterval;

    /** @type {number} 当前等级对应的新生成陨石速度倍率 */
    this.speedMultiplier = 1.0;

    /** @type {Set<Function>} 难度升级事件监听集合 */
    this._levelUpListeners = new Set();

    this._recalculateParameters(this.level);
  }

  /**
   * 根据等级计算生成间隔与速度倍率
   * @param {number} targetLevel
   */
  _recalculateParameters(targetLevel) {
    const validLevel = Math.max(1, Math.floor(targetLevel));
    const levelOffset = validLevel - 1;

    // LV.1=1.4s, LV.2=1.3s, LV.3=1.2s, LV.4=1.1s, LV.5=1.0s ... 最低 0.6s
    const rawInterval = this.baseSpawnInterval - levelOffset * this.intervalStep;
    this.spawnInterval = Number(
      clamp(rawInterval, this.minSpawnInterval, this.baseSpawnInterval).toFixed(2)
    );

    // 陨石速度倍率平滑递增，最高不超过 2.0 倍
    const rawMultiplier = 1.0 + levelOffset * this.speedStep;
    this.speedMultiplier = Number(
      clamp(rawMultiplier, 1.0, this.maxSpeedMultiplier).toFixed(2)
    );
  }

  /**
   * 将当前难度参数同步至 SpawnSystem（仅影响后续新生成的陨石）
   * @param {import('./SpawnSystem.js').SpawnSystem} [spawner]
   */
  applyToSpawner(spawner) {
    if (!spawner) return;
    spawner.currentMeteorInterval = this.spawnInterval;
    spawner.meteorSpeedMultiplier = this.speedMultiplier;
  }

  /**
   * 根据当前累计生存时间更新难度等级
   * @param {number} survivalTime 当前有效生存时间（秒）
   * @param {import('./SpawnSystem.js').SpawnSystem} [spawner] 生成系统实例
   * @returns {boolean} 本帧是否触发了难度升级
   */
  update(survivalTime, spawner) {
    if (!Number.isFinite(survivalTime) || survivalTime < 0) {
      return false;
    }

    const targetLevel = this.initialLevel + Math.floor(survivalTime / this.levelUpInterval);
    if (targetLevel > this.level) {
      const previousLevel = this.level;
      this.level = targetLevel;
      this._recalculateParameters(this.level);
      this.applyToSpawner(spawner);

      this._emitLevelUp({
        previousLevel,
        level: this.level,
        spawnInterval: this.spawnInterval,
        speedMultiplier: this.speedMultiplier,
        survivalTime
      });
      return true;
    }

    // 确保 spawner 始终保持当前难度参数同步
    this.applyToSpawner(spawner);
    return false;
  }

  /**
   * 获取当前难度等级与参数快照
   */
  getStatus() {
    return {
      level: this.level,
      label: `LV.${this.level}`,
      spawnInterval: this.spawnInterval,
      speedMultiplier: this.speedMultiplier
    };
  }

  /**
   * 重置难度到初始 LV.1（供重新开始游戏调用）
   * @param {import('./SpawnSystem.js').SpawnSystem} [spawner]
   */
  reset(spawner) {
    this.level = this.initialLevel;
    this._recalculateParameters(this.level);
    this.applyToSpawner(spawner);
  }

  /**
   * 订阅难度提升事件
   * @param {(payload: {previousLevel: number, level: number, spawnInterval: number, speedMultiplier: number, survivalTime: number}) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onLevelUp(callback) {
    if (typeof callback === 'function') {
      this._levelUpListeners.add(callback);
    }
    return () => this._levelUpListeners.delete(callback);
  }

  _emitLevelUp(payload) {
    for (const cb of this._levelUpListeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[DifficultySystem] onLevelUp 回调异常:', err);
      }
    }
  }

  /**
   * 销毁监听器
   */
  destroy() {
    this._levelUpListeners.clear();
  }
}
