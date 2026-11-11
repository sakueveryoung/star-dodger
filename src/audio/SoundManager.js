/**
 * 《星际躲避者 (Star Dodger)》Web Audio API 原创电子音效合成器 (Phase 6 增强版)
 * 职责：
 * 1. 遵循浏览器自动播放策略，仅在用户首次合法交互（点击/按键）后惰性创建或恢复 AudioContext
 * 2. 完整支持 7 类原创电子合成音效：
 *    - 菜单悬停/点击音效 (buttonHover / buttonClick)
 *    - 游戏开始音效 (gameStart)
 *    - 能量晶体收集音效 (crystalCollect)
 *    - 陨石碰撞碎裂音效 (meteorCollision)
 *    - 玩家受伤护盾警报音效 (playerHit)
 *    - 难度升级提示音效 (levelUp)
 *    - 游戏结束结算音效 (gameOver)
 * 3. 内置同名音效冷却防叠音机制（杜绝同帧重复叠加失真），真实响应静音开关与主音量控制
 */
import { clamp } from '../utils/math.js';

export class SoundManager {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.soundEnabled=true] 初始音效开关
   * @param {number} [options.masterVolume=0.8] 初始主音量 [0, 1]
   */
  constructor(options = {}) {
    this.soundEnabled = options.soundEnabled ?? true;
    this.masterVolume = clamp(options.masterVolume ?? 0.8, 0, 1);

    /** @type {AudioContext|null} */
    this._ctx = null;

    /** @type {GainNode|null} */
    this._masterGain = null;

    /** @type {boolean} 是否已通过用户交互解锁音频上下文 */
    this._userInteracted = false;

    /** @type {Map<string, number>} 各音效上次触发时间戳 (ms)，防止短时间重复叠加 */
    this._lastPlayTimestamps = new Map();

    /** 统计与测试验证状态 */
    this.stats = {
      playedCount: 0,
      suppressedDuplicates: 0,
      lastEffect: null,
      history: []
    };

    this._handleUserUnlock = this._handleUserUnlock.bind(this);
    this._bindUnlockListeners();
  }

  /**
   * 监听首次用户交互以解锁 AudioContext
   */
  _bindUnlockListeners() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this._handleUserUnlock, { passive: true });
    window.addEventListener('keydown', this._handleUserUnlock, { passive: true });
  }

  _handleUserUnlock() {
    this._userInteracted = true;
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /**
   * 惰性获取并激活 AudioContext（仅在用户交互后实例化）
   * @returns {AudioContext|null}
   */
  _ensureContext() {
    if (!this._userInteracted || typeof window === 'undefined') {
      return null;
    }

    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this._ctx = new AudioCtx();
        this._masterGain = this._ctx.createGain();
        this._masterGain.gain.value = this.soundEnabled ? this.masterVolume : 0;
        this._masterGain.connect(this._ctx.destination);
      } catch {
        return null;
      }
    }

    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }

    return this._ctx;
  }

  /**
   * 同步主增益节点音量
   */
  _syncGainNode() {
    if (!this._masterGain || !this._ctx) return;
    const targetGain = this.soundEnabled ? this.masterVolume : 0;
    try {
      this._masterGain.gain.setValueAtTime(targetGain, this._ctx.currentTime);
    } catch {
      this._masterGain.gain.value = targetGain;
    }
  }

  /**
   * 设置音效开关状态
   * @param {boolean} enabled
   */
  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
    this._syncGainNode();
  }

  /**
   * 设置主音量 [0, 1]
   * @param {number} volume
   */
  setMasterVolume(volume) {
    this.masterVolume = Number(clamp(Number(volume) || 0, 0, 1).toFixed(2));
    this._syncGainNode();
  }

  /**
   * 获取当前有效增益值（静音时严格为 0）
   * @returns {number}
   */
  getEffectiveVolume() {
    return this.soundEnabled ? this.masterVolume : 0;
  }

  /**
   * 检查指定音效是否满足防叠加冷却间隔并记录播放日志
   * @param {string} effectName 音效名称
   * @param {number} [cooldownMs=45] 最小防叠加间隔（毫秒）
   * @returns {boolean}
   */
  _tryTriggerEffect(effectName, cooldownMs = 45) {
    if (!this.soundEnabled || this.masterVolume <= 0) {
      return false;
    }

    // 先确保 AudioContext 已初始化，避免首次创建耗时吞噬冷却窗口
    this._ensureContext();

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastTime = this._lastPlayTimestamps.get(effectName) ?? -Infinity;
    if (now - lastTime < cooldownMs) {
      this.stats.suppressedDuplicates++;
      return false;
    }

    this._lastPlayTimestamps.set(effectName, now);
    this.stats.lastEffect = effectName;
    this.stats.playedCount++;
    if (this.stats.history.length >= 30) {
      this.stats.history.shift();
    }
    this.stats.history.push(effectName);
    return true;
  }

  /**
   * 基础单音合成辅助方法
   * @param {Object} opts
   */
  _playTone({
    type = 'sine',
    startFreq = 440,
    endFreq = 440,
    duration = 0.08,
    delay = 0,
    gain = 0.25
  }) {
    if (!this.soundEnabled || this.masterVolume <= 0) {
      return false;
    }

    const ctx = this._ensureContext();
    if (!ctx || !this._masterGain) {
      return false;
    }

    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
      if (endFreq !== startFreq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(gain, now + Math.min(0.012, duration * 0.25));
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(env);
      env.connect(this._masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.01);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 按钮悬停微光音效
   */
  playButtonHover() {
    if (!this._tryTriggerEffect('buttonHover', 40)) return false;
    this._playTone({ type: 'sine', startFreq: 880, endFreq: 1180, duration: 0.035, gain: 0.08 });
    return true;
  }

  /**
   * 1. 菜单点击确认音效
   */
  playButtonClick() {
    this._userInteracted = true;
    if (!this._tryTriggerEffect('buttonClick', 45)) return false;
    this._playTone({ type: 'triangle', startFreq: 620, endFreq: 980, duration: 0.065, gain: 0.18 });
    return true;
  }

  /**
   * 2. 游戏开始跃迁启动音效
   */
  playGameStart() {
    this._userInteracted = true;
    if (!this._tryTriggerEffect('gameStart', 80)) return false;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      this._playTone({
        type: 'triangle',
        startFreq: freq,
        endFreq: freq * 1.05,
        duration: 0.09,
        delay: idx * 0.055,
        gain: 0.2
      });
    });
    return true;
  }

  /**
   * 3. 能量晶体收集清脆音效
   */
  playCrystalCollect() {
    if (!this._tryTriggerEffect('crystalCollect', 45)) return false;
    this._playTone({ type: 'sine', startFreq: 880, endFreq: 1320, duration: 0.08, delay: 0, gain: 0.22 });
    this._playTone({ type: 'triangle', startFreq: 1320, endFreq: 1760, duration: 0.14, delay: 0.05, gain: 0.2 });
    return true;
  }

  /**
   * 4. 陨石碰撞碎裂音效（岩石爆裂低频冲击）
   */
  playMeteorCollision() {
    if (!this._tryTriggerEffect('meteorCollision', 45)) return false;
    this._playTone({ type: 'triangle', startFreq: 165, endFreq: 48, duration: 0.14, delay: 0, gain: 0.22 });
    this._playTone({ type: 'sawtooth', startFreq: 120, endFreq: 38, duration: 0.12, delay: 0.015, gain: 0.15 });
    return true;
  }

  /**
   * 5. 玩家受伤护盾警报音效
   */
  playPlayerHit() {
    if (!this._tryTriggerEffect('playerHit', 65)) return false;
    this._playTone({ type: 'sawtooth', startFreq: 240, endFreq: 56, duration: 0.22, delay: 0, gain: 0.26 });
    this._playTone({ type: 'square', startFreq: 320, endFreq: 110, duration: 0.16, delay: 0.03, gain: 0.16 });
    return true;
  }

  /**
   * 6. 游戏结束结算音效
   */
  playGameOver() {
    if (!this._tryTriggerEffect('gameOver', 120)) return false;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      this._playTone({
        type: 'sawtooth',
        startFreq: freq,
        endFreq: freq * 0.92,
        duration: 0.16,
        delay: idx * 0.11,
        gain: 0.2
      });
    });
    return true;
  }

  /**
   * 7. 难度升级提示音
   */
  playLevelUp() {
    if (!this._tryTriggerEffect('levelUp', 80)) return false;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this._playTone({
        type: 'triangle',
        startFreq: freq,
        endFreq: freq,
        duration: 0.1,
        delay: idx * 0.06,
        gain: 0.18
      });
    });
    return true;
  }

  /**
   * 暂停 / 恢复切换音效
   * @param {boolean} isPaused
   */
  playPauseToggle(isPaused) {
    const key = isPaused ? 'pause' : 'resume';
    if (!this._tryTriggerEffect(key, 50)) return false;
    if (isPaused) {
      this._playTone({ type: 'sine', startFreq: 660, endFreq: 440, duration: 0.09, gain: 0.16 });
    } else {
      this._playTone({ type: 'sine', startFreq: 440, endFreq: 660, duration: 0.09, gain: 0.16 });
    }
    return true;
  }

  /**
   * 销毁音频上下文与事件监听
   */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._handleUserUnlock);
      window.removeEventListener('keydown', this._handleUserUnlock);
    }
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {});
    }
    this._ctx = null;
    this._masterGain = null;
  }
}
