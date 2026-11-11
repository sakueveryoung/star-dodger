/**
 * 《星际躲避者 (Star Dodger)》积分与生存时间管理系统
 * 职责：
 * 1. 每生存 1 秒自动增加 1 分（使用 deltaTime 精确累加，支持小数帧间隔结转）
 * 2. 接收 CollisionSystem 的能量晶体收集事件，每颗晶体增加 10 分
 * 3. 游戏暂停 (PAUSED) 或结束 (GAME_OVER) 时严格停止生存时间与积分增长
 * 4. 提供 addScore、getScore、getSurvivalTime、reset、stopScoring 等标准接口
 */
import { GAME_CONFIG } from '../config/gameConfig.js';

export class ScoreManager {
  constructor() {
    const diffCfg = GAME_CONFIG.DIFFICULTY;
    this.survivalScoreInterval = diffCfg.SURVIVAL_SCORE_INTERVAL || 1.0;
    this.survivalScoreValue = diffCfg.SURVIVAL_SCORE_VALUE || 1;
    this.crystalScoreValue = GAME_CONFIG.CRYSTAL.SCORE_VALUE || 10;

    /** @type {number} 当前总积分 */
    this.score = 0;

    /** @type {number} 本局累计有效生存时间（秒） */
    this.survivalTime = 0;

    /** @type {number} 生存秒数加分累加器（满 1.0 秒结算一次 +1 分） */
    this._survivalTickTimer = 0;

    /** @type {number} 本局累计通过生存获得的分数 */
    this.survivalPointsEarned = 0;

    /** @type {number} 本局累计通过收集晶体获得的分数 */
    this.crystalPointsEarned = 0;

    /** @type {number} 本局收集的能量晶体数量 */
    this.crystalsCollected = 0;

    /** @type {boolean} 是否允许计分（PLAYING 状态为 true，PAUSED / GAME_OVER 为 false） */
    this.isScoring = true;

    /** @type {Set<Function>} 积分更新监听回调集合 */
    this._scoreListeners = new Set();
  }

  /**
   * 随 deltaTime 更新生存时间并按每满 1 秒增加 1 分
   * @param {number} deltaTime 帧间隔（秒）
   */
  update(deltaTime) {
    if (!this.isScoring || deltaTime <= 0) {
      return;
    }

    this.survivalTime += deltaTime;
    this._survivalTickTimer += deltaTime;

    let scoreChanged = false;
    while (this._survivalTickTimer >= this.survivalScoreInterval) {
      this._survivalTickTimer -= this.survivalScoreInterval;
      this.score += this.survivalScoreValue;
      this.survivalPointsEarned += this.survivalScoreValue;
      scoreChanged = true;
    }

    if (scoreChanged) {
      this._emitScoreChange('SURVIVAL', this.survivalScoreValue);
    }
  }

  /**
   * 增加指定分数（用于收集能量晶体 +10 分或额外奖励）
   * @param {number} points 增加的分值
   * @param {'CRYSTAL'|'SURVIVAL'|'BONUS'} [reason='CRYSTAL'] 得分来源
   * @returns {number} 更新后的总分
   */
  addScore(points, reason = 'CRYSTAL') {
    if (!this.isScoring) {
      return this.score;
    }

    const validPoints = Math.max(0, Math.floor(Number(points) || 0));
    if (validPoints <= 0) {
      return this.score;
    }

    this.score += validPoints;
    if (reason === 'CRYSTAL') {
      this.crystalPointsEarned += validPoints;
      this.crystalsCollected += 1;
    }

    this._emitScoreChange(reason, validPoints);
    return this.score;
  }

  /**
   * 获取当前总积分
   * @returns {number}
   */
  getScore() {
    return this.score;
  }

  /**
   * 获取当前有效生存时间（秒）
   * @returns {number}
   */
  getSurvivalTime() {
    return this.survivalTime;
  }

  /**
   * 停止计分与生存计时（在暂停或 Game Over 时调用）
   */
  stopScoring() {
    this.isScoring = false;
  }

  /**
   * 恢复计分与生存计时
   */
  startScoring() {
    this.isScoring = true;
  }

  /**
   * 重置积分与生存时间（供新局重新开始时调用）
   */
  reset() {
    this.score = 0;
    this.survivalTime = 0;
    this._survivalTickTimer = 0;
    this.survivalPointsEarned = 0;
    this.crystalPointsEarned = 0;
    this.crystalsCollected = 0;
    this.isScoring = true;
    this._emitScoreChange('RESET', 0);
  }

  /**
   * 订阅积分变化事件
   * @param {(payload: {score: number, survivalTime: number, delta: number, reason: string, crystalsCollected: number}) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onScoreChange(callback) {
    if (typeof callback === 'function') {
      this._scoreListeners.add(callback);
    }
    return () => this._scoreListeners.delete(callback);
  }

  _emitScoreChange(reason, delta) {
    const payload = {
      score: this.score,
      survivalTime: this.survivalTime,
      delta,
      reason,
      crystalsCollected: this.crystalsCollected
    };

    for (const cb of this._scoreListeners) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[ScoreManager] onScoreChange 回调异常:', err);
      }
    }
  }

  /**
   * 销毁所有监听器
   */
  destroy() {
    this._scoreListeners.clear();
  }
}
