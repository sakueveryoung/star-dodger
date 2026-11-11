/**
 * 《星际躲避者 (Star Dodger)》本地存档管理器
 * 基于 LocalStorage 持久化存储历史最高分、最近一次成绩、音效开关与主音量设置
 * 包含完整的数据结构校验、JSON 解析容错与隐私模式内存降级保护
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp } from './math.js';

const DEFAULT_SAVE_DATA = Object.freeze({
  version: 1,
  highScore: 0,
  lastScore: 0,
  soundEnabled: GAME_CONFIG.AUDIO?.DEFAULT_SOUND_ENABLED ?? true,
  masterVolume: GAME_CONFIG.AUDIO?.DEFAULT_MASTER_VOLUME ?? 0.8,
  updatedAt: 0
});

export class StorageManager {
  /**
   * @param {string} [storageKey] 存档键名，默认使用 'starDodgerSave_v1'
   */
  constructor(storageKey = GAME_CONFIG.STORAGE_KEYS.SAVE_DATA || 'starDodgerSave_v1') {
    this.storageKey = storageKey;

    /** @type {Object} 内存缓存副本（当浏览器禁用 LocalStorage 时作为降级兜底） */
    this._memoryCache = { ...DEFAULT_SAVE_DATA };

    /** @type {boolean} 当前环境 LocalStorage 是否可用 */
    this.isStorageAvailable = this._checkStorageAvailability();

    // 初始化时立即加载并校验本地数据
    this.load();
  }

  /**
   * 检测当前浏览器环境是否允许访问 LocalStorage
   * @returns {boolean}
   */
  _checkStorageAvailability() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const testKey = '__star_dodger_storage_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 校验并清洗存档数据，过滤非法值、负数或 NaN
   * @param {any} raw 待校验的原始对象
   * @returns {{version: number, highScore: number, lastScore: number, soundEnabled: boolean, masterVolume: number, updatedAt: number}}
   */
  _sanitizeData(raw) {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_SAVE_DATA };
    }

    const highScore =
      typeof raw.highScore === 'number' && Number.isFinite(raw.highScore) && raw.highScore >= 0
        ? Math.floor(raw.highScore)
        : 0;

    const lastScore =
      typeof raw.lastScore === 'number' && Number.isFinite(raw.lastScore) && raw.lastScore >= 0
        ? Math.floor(raw.lastScore)
        : 0;

    const soundEnabled =
      typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULT_SAVE_DATA.soundEnabled;

    const masterVolume =
      typeof raw.masterVolume === 'number' && Number.isFinite(raw.masterVolume)
        ? Number(clamp(raw.masterVolume, 0, 1).toFixed(2))
        : DEFAULT_SAVE_DATA.masterVolume;

    const updatedAt =
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0
        ? Math.floor(raw.updatedAt)
        : 0;

    return {
      version: 1,
      highScore: Math.max(highScore, lastScore),
      lastScore,
      soundEnabled,
      masterVolume,
      updatedAt
    };
  }

  /**
   * 从 LocalStorage 读取并校验存档数据（支持 JSON 损坏容错与禁用降级）
   * @returns {{version: number, highScore: number, lastScore: number, soundEnabled: boolean, masterVolume: number, updatedAt: number}}
   */
  load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const rawStr = window.localStorage.getItem(this.storageKey);
        if (rawStr) {
          const parsed = JSON.parse(rawStr);
          this._memoryCache = this._sanitizeData(parsed);
          return { ...this._memoryCache };
        }
      }
    } catch (err) {
      console.warn('[StorageManager] 读取或解析本地存档失败，已回退至安全默认存档:', err);
    }

    this._memoryCache = this._sanitizeData(this._memoryCache);
    return { ...this._memoryCache };
  }

  /**
   * 将数据校验后写入 LocalStorage（若写入失败则保留在内存缓存中，不中断游戏运行）
   * @param {Partial<typeof DEFAULT_SAVE_DATA>} partialData 要更新的字段
   * @returns {boolean} 是否成功写入物理 LocalStorage
   */
  save(partialData = {}) {
    const merged = this._sanitizeData({
      ...this._memoryCache,
      ...partialData,
      updatedAt: Date.now()
    });

    this._memoryCache = merged;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(merged));
        return true;
      }
    } catch (err) {
      console.warn('[StorageManager] LocalStorage 写入失败，已保存在内存缓存中:', err);
    }

    return false;
  }

  /**
   * 记录单局最终得分，自动比对并更新历史最高分
   * @param {number} finalScore 本局最终得分
   * @returns {{highScore: number, lastScore: number, isNewRecord: boolean}}
   */
  recordGameScore(finalScore) {
    const validScore =
      typeof finalScore === 'number' && Number.isFinite(finalScore) && finalScore >= 0
        ? Math.floor(finalScore)
        : 0;

    const currentData = this.load();
    const isNewRecord = validScore > currentData.highScore;
    const nextHighScore = Math.max(currentData.highScore, validScore);

    this.save({
      highScore: nextHighScore,
      lastScore: validScore
    });

    return {
      highScore: nextHighScore,
      lastScore: validScore,
      isNewRecord
    };
  }

  /**
   * 获取历史最高分
   * @returns {number}
   */
  getHighScore() {
    return this._memoryCache.highScore;
  }

  /**
   * 获取最近一次成绩
   * @returns {number}
   */
  getLastScore() {
    return this._memoryCache.lastScore;
  }

  /**
   * 获取音效开关设置
   * @returns {boolean}
   */
  isSoundEnabled() {
    return this._memoryCache.soundEnabled;
  }

  /**
   * 设置音效开关并保存
   * @param {boolean} enabled
   */
  setSoundEnabled(enabled) {
    this.save({ soundEnabled: Boolean(enabled) });
  }

  /**
   * 获取主音量设置 [0, 1]
   * @returns {number}
   */
  getMasterVolume() {
    return this._memoryCache.masterVolume;
  }

  /**
   * 设置主音量 [0, 1] 并保存
   * @param {number} volume
   */
  setMasterVolume(volume) {
    const validVol = Number(clamp(Number(volume) || 0, 0, 1).toFixed(2));
    this.save({ masterVolume: validVol });
  }

  /**
   * 获取完整设置对象
   * @returns {{soundEnabled: boolean, masterVolume: number}}
   */
  getSettings() {
    return {
      soundEnabled: this._memoryCache.soundEnabled,
      masterVolume: this._memoryCache.masterVolume
    };
  }

  /**
   * 恢复默认游戏设置（重置音效开关与音量，但严格保留历史最高分与最近成绩）
   * @returns {{soundEnabled: boolean, masterVolume: number, highScore: number}}
   */
  restoreDefaultSettings() {
    this.save({
      soundEnabled: DEFAULT_SAVE_DATA.soundEnabled,
      masterVolume: DEFAULT_SAVE_DATA.masterVolume
    });
    return {
      soundEnabled: this._memoryCache.soundEnabled,
      masterVolume: this._memoryCache.masterVolume,
      highScore: this._memoryCache.highScore
    };
  }
}
