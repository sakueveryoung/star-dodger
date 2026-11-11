/**
 * 《星际躲避者 (Star Dodger)》全局 UI 与交互管理器
 * 职责：
 * 1. 统一管理正式主菜单 (MENU)、操作说明 (HOW TO PLAY)、系统设置 (SETTINGS)、
 *    顶部战斗 HUD、完整暂停菜单 (PAUSED) 与正式结算界面 (GAME OVER)
 * 2. 绑定所有按钮点击、悬停音效、键盘 Tab 焦点与 Enter/Space 触发交互
 * 3. 连接 StorageManager 与 SoundManager，实现音效开关、主音量滑块、恢复默认设置及 Fullscreen API 全屏切换
 * 4. 实时同步生命值图标/能量条、难度等级、陨石速度倍率、生存时间、当前得分、历史最高分与收集晶体数
 */
import { GAME_STATE } from '../config/gameConfig.js';
import { AnimationManager } from './AnimationManager.js';

export class UIManager {
  /**
   * @param {Object} options
   * @param {import('../utils/StorageManager.js').StorageManager} options.storage
   * @param {import('../audio/SoundManager.js').SoundManager} options.sound
   * @param {Object} options.callbacks 游戏核心控制回调集合
   * @param {Function} options.callbacks.onStartGame
   * @param {Function} options.callbacks.onResumeGame
   * @param {Function} options.callbacks.onRestartGame
   * @param {Function} options.callbacks.onReturnToMenu
   */
  constructor({ storage, sound, callbacks }) {
    this.storage = storage;
    this.sound = sound;
    this.callbacks = callbacks || {};

    /** @type {'HOW_TO_PLAY'|'SETTINGS'|null} 当前打开的二级模态框 */
    this.activeModal = null;

    /** @type {string} 打开设置面板前的来源状态 (MENU 或 PAUSED) */
    this._settingsReturnState = GAME_STATE.MENU;

    /** @type {number} LEVEL UP 横幅剩余显示秒数 */
    this._levelUpTimer = 0;

    /** @type {number|null} 轻提示定时器 */
    this._toastTimeout = null;

    this._cacheElements();

    // 初始化动画与主菜单战机展示管理器
    this.animator = new AnimationManager(this.els.menuShipCanvas);

    this._bindEvents();
    this.syncSettingsControls();
    this.syncBestScore(this.storage.getHighScore());
  }

  /**
   * 缓存全部 UI DOM 节点
   */
  _cacheElements() {
    const byId = (id) => document.getElementById(id);

    this.els = {
      // 顶部 HUD
      hudTopbar: byId('hud-topbar'),
      hudHealthBars: byId('hud-health-bars'),
      hudHealthText: byId('hud-health-text'),
      hudHealthProgressFill: byId('hud-health-progress-fill'),
      hudDifficulty: byId('hud-difficulty'),
      hudSpeedMultiplier: byId('hud-speed-multiplier'),
      hudSpawnRate: byId('hud-spawn-rate'),
      hudGameState: byId('hud-game-state'),
      engineTelemetry: byId('engine-telemetry'),
      hudSurvivalTime: byId('hud-survival-time'),
      hudScore: byId('hud-score'),
      hudHighScore: byId('hud-high-score'),

      // LEVEL UP 横幅
      levelUpBanner: byId('hud-levelup-banner'),
      levelUpTitle: byId('hud-levelup-title'),
      levelUpDesc: byId('hud-levelup-desc'),

      // 主菜单 (MENU)
      screenMainMenu: byId('screen-main-menu'),
      menuBestScore: byId('menu-best-score'),
      menuShipCanvas: byId('menu-ship-canvas'),
      btnMenuStart: byId('btn-menu-start'),
      btnMenuHowto: byId('btn-menu-howto'),
      btnMenuSettings: byId('btn-menu-settings'),

      // 游戏说明面板 (HOW TO PLAY)
      modalHowToPlay: byId('modal-howtoplay'),
      btnHowtoReturn: byId('btn-howto-return'),

      // 游戏设置面板 (SETTINGS)
      modalSettings: byId('modal-settings'),
      btnToggleSound: byId('btn-toggle-sound'),
      labelSoundState: byId('label-sound-state'),
      sliderVolume: byId('slider-volume'),
      labelVolumeValue: byId('label-volume-value'),
      btnToggleFullscreen: byId('btn-toggle-fullscreen'),
      labelFullscreenState: byId('label-fullscreen-state'),
      settingsFeedback: byId('settings-feedback'),
      btnSettingsRestore: byId('btn-settings-restore'),
      btnSettingsBack: byId('btn-settings-back'),

      // 暂停菜单 (PAUSED)
      screenPauseMenu: byId('hud-pause-banner'),
      btnPauseResume: byId('btn-resume'),
      btnPauseRestart: byId('btn-pause-restart'),
      btnPauseSettings: byId('btn-pause-settings'),
      btnPauseMainMenu: byId('btn-pause-mainmenu'),

      // 结算面板 (GAME OVER)
      screenGameOver: byId('hud-gameover-panel'),
      gameOverRecordBadge: byId('gameover-new-record'),
      gameOverBestLabel: byId('gameover-best-label'),
      gameOverFinalScore: byId('gameover-final-score'),
      gameOverHighScore: byId('gameover-high-score'),
      gameOverSurvivalTime: byId('gameover-survival-time'),
      gameOverDifficulty: byId('gameover-difficulty'),
      gameOverCrystals: byId('gameover-crystals'),
      btnGameOverPlayAgain: byId('btn-restart'),
      btnGameOverMainMenu: byId('btn-gameover-mainmenu'),

      // 全局 Toast
      toast: byId('ui-toast')
    };
  }

  /**
   * 绑定 UI 按钮、滑块、全屏事件与键盘焦点导航（仅在初始化时绑定一次，绝不重复注册）
   */
  _bindEvents() {
    this._boundListeners = [];
    const on = (el, evt, handler) => {
      if (!el) return;
      el.addEventListener(evt, handler);
      this._boundListeners.push(() => el.removeEventListener(evt, handler));
    };

    // 为所有交互按钮挂载统一的悬停微光音效
    const allButtons = document.querySelectorAll('.sci-btn, .sci-switch');
    allButtons.forEach((btn) => {
      on(btn, 'mouseenter', () => {
        this.sound?.playButtonHover();
      });
    });

    // 1. 主菜单按钮
    on(this.els.btnMenuStart, 'click', () => {
      this.sound?.playGameStart();
      this.callbacks.onStartGame?.();
    });

    on(this.els.btnMenuHowto, 'click', () => {
      this.sound?.playButtonClick();
      this.openHowToPlay();
    });

    on(this.els.btnMenuSettings, 'click', () => {
      this.sound?.playButtonClick();
      this.openSettings(GAME_STATE.MENU);
    });

    // 2. 操作说明返回按钮
    on(this.els.btnHowtoReturn, 'click', () => {
      this.sound?.playButtonClick();
      this.closeHowToPlay();
    });

    // 3. 设置面板控件
    on(this.els.btnToggleSound, 'click', () => {
      const nextState = !this.storage.isSoundEnabled();
      this.storage.setSoundEnabled(nextState);
      this.sound?.setSoundEnabled(nextState);
      if (nextState) {
        this.sound?.playButtonClick();
      }
      this.syncSettingsControls();
      this._setSettingsFeedback(`音效已${nextState ? '开启 (ON)' : '关闭 (OFF)'}`);
    });

    on(this.els.sliderVolume, 'input', (e) => {
      const percent = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      const volumeRatio = Number((percent / 100).toFixed(2));
      this.storage.setMasterVolume(volumeRatio);
      this.sound?.setMasterVolume(volumeRatio);
      this.syncSettingsControls();
    });

    on(this.els.sliderVolume, 'change', () => {
      this.sound?.playButtonClick();
      this._setSettingsFeedback(`主音量已保存为 ${Math.round(this.storage.getMasterVolume() * 100)}%`);
    });

    on(this.els.btnToggleFullscreen, 'click', () => {
      this.sound?.playButtonClick();
      this.toggleFullscreen();
    });

    on(this.els.btnSettingsRestore, 'click', () => {
      const restored = this.storage.restoreDefaultSettings();
      this.sound?.setSoundEnabled(restored.soundEnabled);
      this.sound?.setMasterVolume(restored.masterVolume);
      this.sound?.playButtonClick();
      this.syncSettingsControls();
      this._setSettingsFeedback('已恢复默认设置（SOUND: ON · VOLUME: 80%）');
      this.showToast('已恢复默认设置');
    });

    on(this.els.btnSettingsBack, 'click', () => {
      this.sound?.playButtonClick();
      this.closeSettings();
    });

    // 4. 暂停菜单按钮
    on(this.els.btnPauseResume, 'click', () => {
      this.sound?.playPauseToggle(false);
      this.callbacks.onResumeGame?.();
    });

    on(this.els.btnPauseRestart, 'click', () => {
      this.sound?.playGameStart();
      this.callbacks.onRestartGame?.();
    });

    on(this.els.btnPauseSettings, 'click', () => {
      this.sound?.playButtonClick();
      this.openSettings(GAME_STATE.PAUSED);
    });

    on(this.els.btnPauseMainMenu, 'click', () => {
      this.sound?.playButtonClick();
      this.callbacks.onReturnToMenu?.();
    });

    // 5. GAME OVER 结算按钮
    on(this.els.btnGameOverPlayAgain, 'click', () => {
      this.sound?.playGameStart();
      this.callbacks.onRestartGame?.();
    });

    on(this.els.btnGameOverMainMenu, 'click', () => {
      this.sound?.playButtonClick();
      this.callbacks.onReturnToMenu?.();
    });

    // 6. 监听浏览器全屏状态变化
    on(document, 'fullscreenchange', () => {
      this._syncFullscreenLabel();
    });
  }

  /**
   * 根据游戏主状态切换对应界面显隐
   * @param {string} gameState MENU | PLAYING | PAUSED | GAME_OVER
   */
  syncScreenWithState(gameState) {
    this.activeModal = null;
    this.animator.hidePanel(this.els.modalHowToPlay);
    this.animator.hidePanel(this.els.modalSettings);

    if (this.els.hudGameState) {
      this.els.hudGameState.textContent = gameState;
    }

    if (gameState === GAME_STATE.MENU) {
      // 主菜单状态：显示正式主菜单，隐藏顶部战斗 HUD、暂停菜单与结算面板
      this.animator.hidePanel(this.els.hudTopbar);
      this.animator.hidePanel(this.els.levelUpBanner);
      this.animator.hidePanel(this.els.screenPauseMenu);
      this.animator.hidePanel(this.els.screenGameOver);
      this.animator.showPanel(this.els.screenMainMenu);
      this.syncBestScore(this.storage.getHighScore());
      return;
    }

    // 非 MENU 状态：隐藏主菜单，显示顶部战斗 HUD
    this.animator.hidePanel(this.els.screenMainMenu);
    this.animator.showPanel(this.els.hudTopbar);

    if (gameState === GAME_STATE.PLAYING) {
      this.animator.hidePanel(this.els.screenPauseMenu);
      this.animator.hidePanel(this.els.screenGameOver);
    } else if (gameState === GAME_STATE.PAUSED) {
      this.animator.hidePanel(this.els.screenGameOver);
      this.animator.showPanel(this.els.screenPauseMenu);
    } else if (gameState === GAME_STATE.GAME_OVER) {
      this.animator.hidePanel(this.els.screenPauseMenu);
      this.animator.showPanel(this.els.screenGameOver);
    }
  }

  /**
   * 打开游戏操作说明界面 (HOW TO PLAY)
   */
  openHowToPlay() {
    this.activeModal = 'HOW_TO_PLAY';
    this.animator.hidePanel(this.els.screenMainMenu);
    this.animator.showPanel(this.els.modalHowToPlay);
    this.els.btnHowtoReturn?.focus();
  }

  /**
   * 关闭游戏操作说明界面并返回主菜单
   */
  closeHowToPlay() {
    if (this.activeModal !== 'HOW_TO_PLAY') return;
    this.activeModal = null;
    this.animator.hidePanel(this.els.modalHowToPlay);
    this.animator.showPanel(this.els.screenMainMenu);
    this.els.btnMenuHowto?.focus();
  }

  /**
   * 打开游戏设置界面 (SETTINGS)
   * @param {string} [fromState=GAME_STATE.MENU] 来源状态 (MENU 或 PAUSED)
   */
  openSettings(fromState = GAME_STATE.MENU) {
    this._settingsReturnState = fromState;
    this.activeModal = 'SETTINGS';
    this._setSettingsFeedback('');
    this.syncSettingsControls();

    if (fromState === GAME_STATE.PAUSED) {
      this.animator.hidePanel(this.els.screenPauseMenu);
    } else {
      this.animator.hidePanel(this.els.screenMainMenu);
    }

    this.animator.showPanel(this.els.modalSettings);
    this.els.btnSettingsBack?.focus();
  }

  /**
   * 关闭游戏设置界面并返回上一级（主菜单或暂停菜单）
   */
  closeSettings() {
    if (this.activeModal !== 'SETTINGS') return;
    this.activeModal = null;
    this.animator.hidePanel(this.els.modalSettings);

    if (this._settingsReturnState === GAME_STATE.PAUSED) {
      this.animator.showPanel(this.els.screenPauseMenu);
      this.els.btnPauseSettings?.focus();
    } else {
      this.animator.showPanel(this.els.screenMainMenu);
      this.els.btnMenuSettings?.focus();
    }
  }

  /**
   * 同步设置界面控件状态（SOUND 开关、MASTER VOLUME 滑块与百分比、FULLSCREEN 状态）
   */
  syncSettingsControls() {
    const soundEnabled = this.storage.isSoundEnabled();
    const volumePercent = Math.round(this.storage.getMasterVolume() * 100);

    if (this.els.btnToggleSound) {
      this.els.btnToggleSound.classList.toggle('active', soundEnabled);
      this.els.btnToggleSound.setAttribute('aria-checked', String(soundEnabled));
    }
    if (this.els.labelSoundState) {
      this.els.labelSoundState.textContent = soundEnabled ? 'ON' : 'OFF';
    }
    if (this.els.sliderVolume) {
      this.els.sliderVolume.value = String(volumePercent);
    }
    if (this.els.labelVolumeValue) {
      this.els.labelVolumeValue.textContent = `${volumePercent}%`;
    }

    this._syncFullscreenLabel();
  }

  /**
   * 使用 Fullscreen API 切换全屏模式（若受浏览器策略限制则给出清晰提示，不抛未捕获异常）
   */
  async toggleFullscreen() {
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenEnabled && !docEl.requestFullscreen) {
        const msg = '当前浏览器环境不支持或已禁用全屏切换 API';
        this._setSettingsFeedback(msg);
        this.showToast(msg);
        return false;
      }

      if (!document.fullscreenElement) {
        await docEl.requestFullscreen();
        this._syncFullscreenLabel();
        this._setSettingsFeedback('已进入全屏模式');
        return true;
      } else {
        await document.exitFullscreen();
        this._syncFullscreenLabel();
        this._setSettingsFeedback('已退出全屏模式');
        return true;
      }
    } catch {
      const msg = '当前浏览器环境限制自动切换全屏，请使用 F11 键或检查浏览器权限';
      this._setSettingsFeedback(msg);
      this.showToast(msg);
      this._syncFullscreenLabel();
      return false;
    }
  }

  _syncFullscreenLabel() {
    if (!this.els.labelFullscreenState) return;
    const isFull = Boolean(document.fullscreenElement);
    this.els.labelFullscreenState.textContent = isFull ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN';
  }

  _setSettingsFeedback(message) {
    if (this.els.settingsFeedback) {
      this.els.settingsFeedback.textContent = message || '';
    }
  }

  /**
   * 显示简短科幻轻提示
   * @param {string} message
   * @param {number} [durationMs=2400]
   */
  showToast(message, durationMs = 2400) {
    if (!this.els.toast) return;
    this.els.toast.textContent = message;
    this.els.toast.classList.remove('hidden');

    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
    }
    this._toastTimeout = setTimeout(() => {
      this.els.toast?.classList.add('hidden');
    }, durationMs);
  }

  /**
   * 同步 HUD 左上角生命值格与连续能量进度条
   * @param {number} currentHealth
   * @param {number} maxHealth
   */
  syncHealth(currentHealth, maxHealth) {
    if (this.els.hudHealthText) {
      this.els.hudHealthText.textContent = `${currentHealth} / ${maxHealth}`;
    }

    if (this.els.hudHealthBars) {
      const cells = this.els.hudHealthBars.querySelectorAll('.health-cell');
      cells.forEach((cell, idx) => {
        cell.classList.remove('active', 'critical', 'lost');
        if (idx < currentHealth) {
          cell.classList.add(currentHealth === 1 ? 'critical' : 'active');
        } else {
          cell.classList.add('lost');
        }
      });
    }

    if (this.els.hudHealthProgressFill) {
      const pct = maxHealth > 0 ? Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100)) : 0;
      this.els.hudHealthProgressFill.style.width = `${pct.toFixed(1)}%`;
      this.els.hudHealthProgressFill.classList.toggle('critical', currentHealth === 1);
    }
  }

  /**
   * 同步主菜单与 HUD 历史最高分及当前得分
   * @param {number} score
   * @param {number} highScore
   */
  syncScore(score, highScore) {
    if (this.els.hudScore) {
      const prev = this.els.hudScore.textContent;
      const next = String(score);
      this.els.hudScore.textContent = next;
      if (prev !== next && score > 0) {
        this.animator.pulseElement(this.els.hudScore);
      }
    }
    this.syncBestScore(highScore);
  }

  /**
   * 同步所有展示历史最高分的节点
   * @param {number} highScore
   */
  syncBestScore(highScore) {
    const text = String(highScore);
    if (this.els.hudHighScore) {
      this.els.hudHighScore.textContent = text;
    }
    if (this.els.menuBestScore) {
      this.els.menuBestScore.textContent = text;
    }
  }

  /**
   * 同步 HUD 生存时间显示 (MM:SS.d)
   * @param {number} totalSeconds
   */
  syncSurvivalTime(totalSeconds) {
    if (!this.els.hudSurvivalTime) return;
    this.els.hudSurvivalTime.textContent = this.formatTime(totalSeconds);
  }

  /**
   * 同步 HUD 难度等级、陨石速度倍率与生成间隔
   * @param {{level: number, label: string, spawnInterval: number, speedMultiplier: number}} status
   */
  syncDifficulty(status) {
    if (this.els.hudDifficulty) {
      this.els.hudDifficulty.textContent = status.label;
    }
    if (this.els.hudSpeedMultiplier) {
      this.els.hudSpeedMultiplier.textContent = `${status.speedMultiplier.toFixed(2)}x`;
    }
    if (this.els.hudSpawnRate) {
      this.els.hudSpawnRate.textContent = `INTERVAL ${status.spawnInterval.toFixed(2)}s · SPEED ${status.speedMultiplier.toFixed(2)}x`;
    }
  }

  /**
   * 触发难度提升发光横幅提示
   * @param {{level: number, spawnInterval: number, speedMultiplier: number}} payload
   */
  showLevelUpBanner(payload) {
    if (!this.els.levelUpBanner) return;
    if (this.els.levelUpTitle) {
      this.els.levelUpTitle.textContent = `LEVEL UP · LV.${payload.level}`;
    }
    if (this.els.levelUpDesc) {
      this.els.levelUpDesc.textContent = `新陨石生成间隔 ${payload.spawnInterval.toFixed(2)}s · 陨石速度倍率 ${payload.speedMultiplier.toFixed(2)}x`;
    }
    this.els.levelUpBanner.classList.remove('hidden');
    this._levelUpTimer = 2.8;
  }

  /**
   * 填充并展示正式 GAME OVER 结算面板
   * @param {{finalScore: number, highScore: number, survivalTime: number, difficultyLevel: number, crystalsCollected: number, isNewRecord: boolean}} data
   */
  populateGameOver(data) {
    if (this.els.gameOverFinalScore) {
      this.els.gameOverFinalScore.textContent = String(data.finalScore);
    }
    if (this.els.gameOverHighScore) {
      this.els.gameOverHighScore.textContent = String(data.highScore);
    }
    if (this.els.gameOverSurvivalTime) {
      this.els.gameOverSurvivalTime.textContent = `${data.survivalTime.toFixed(1)}s`;
    }
    if (this.els.gameOverDifficulty) {
      this.els.gameOverDifficulty.textContent = `LV.${data.difficultyLevel}`;
    }
    if (this.els.gameOverCrystals) {
      this.els.gameOverCrystals.textContent = String(data.crystalsCollected);
    }

    if (this.els.gameOverRecordBadge) {
      this.els.gameOverRecordBadge.classList.remove('hidden', 'is-new-record', 'is-best-score');
      if (data.isNewRecord) {
        this.els.gameOverRecordBadge.textContent = '★ NEW HIGH SCORE ★';
        this.els.gameOverRecordBadge.classList.add('is-new-record');
      } else {
        this.els.gameOverRecordBadge.textContent = `BEST SCORE · ${data.highScore}`;
        this.els.gameOverRecordBadge.classList.add('is-best-score');
      }
    }
  }

  /**
   * 单帧更新 UI 动态组件（主菜单大型战机全息展示、LEVEL UP 横幅倒计时）
   * @param {number} deltaTime
   * @param {string} currentGameState
   */
  update(deltaTime, currentGameState) {
    if (currentGameState === GAME_STATE.MENU && !this.activeModal) {
      this.animator.updateAndRenderMenuShowcase(deltaTime);
    }

    if (this._levelUpTimer > 0) {
      this._levelUpTimer = Math.max(0, this._levelUpTimer - deltaTime);
      if (this._levelUpTimer <= 0 && this.els.levelUpBanner) {
        this.els.levelUpBanner.classList.add('hidden');
      }
    }
  }

  /**
   * 格式化秒数为 MM:SS.d
   * @param {number} totalSeconds
   * @returns {string}
   */
  formatTime(totalSeconds) {
    const safeSec = Math.max(0, Number(totalSeconds) || 0);
    const mins = Math.floor(safeSec / 60);
    const secs = Math.floor(safeSec % 60);
    const tenths = Math.floor((safeSec - Math.floor(safeSec)) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }

  /**
   * 销毁 UI 事件监听
   */
  destroy() {
    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
    }
    if (this._boundListeners) {
      this._boundListeners.forEach((off) => off());
      this._boundListeners = [];
    }
  }
}
