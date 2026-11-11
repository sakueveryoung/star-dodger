/**
 * 《星际躲避者 (Star Dodger)》游戏核心总控制器 (Phase 5 完整版)
 * 负责协调 Viewport、InputManager、BackgroundSystem、Player、PlayerHealth、
 * SpawnSystem、CollisionSystem、ParticleSystem、ScoreManager、DifficultySystem、
 * StorageManager、SoundManager、UIManager、GameStateManager 与唯一 GameLoop 的生命周期
 */
import { GAME_CONFIG, GAME_STATE } from '../config/gameConfig.js';
import { Viewport } from './Viewport.js';
import { GameLoop } from './GameLoop.js';
import { InputManager } from './InputManager.js';
import { GameStateManager } from './GameState.js';
import { BackgroundSystem } from '../systems/BackgroundSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { ScoreManager } from '../systems/ScoreManager.js';
import { DifficultySystem } from '../systems/DifficultySystem.js';
import { Player } from '../entities/Player.js';
import { PlayerHealth } from '../entities/PlayerHealth.js';
import { StorageManager } from '../utils/StorageManager.js';
import { SoundManager } from '../audio/SoundManager.js';
import { UIManager } from '../ui/UIManager.js';
import { randomRange } from '../utils/math.js';

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas 游戏渲染画布
   */
  constructor(canvas) {
    if (!canvas) {
      throw new Error('[Game] 初始化失败：未找到有效的 Canvas 元素');
    }

    this.canvas = canvas;
    this.config = GAME_CONFIG;

    // 1. 初始化游戏状态管理器（Phase 5 首次启动默认进入 MENU 主菜单状态）
    this.gameState = new GameStateManager(GAME_STATE.MENU);

    // 2. 初始化本地存档系统并读取历史最高分与音频设置
    this.storage = new StorageManager();
    this.highScore = this.storage.getHighScore();
    this.isNewRecord = false;

    // 3. 初始化 Web Audio API 原创电子音效合成器
    this.sound = new SoundManager({
      soundEnabled: this.storage.isSoundEnabled(),
      masterVolume: this.storage.getMasterVolume()
    });

    // 4. 初始化高清自适应视口
    this.viewport = new Viewport(this.canvas, {
      designWidth: GAME_CONFIG.VIEWPORT.DESIGN_WIDTH,
      designHeight: GAME_CONFIG.VIEWPORT.DESIGN_HEIGHT,
      maxDpr: GAME_CONFIG.VIEWPORT.MAX_DPR
    });

    // 5. 初始化键盘输入管理器
    this.input = new InputManager();

    // 6. 初始化深空霓虹背景系统
    this.background = new BackgroundSystem(this.viewport.width, this.viewport.height);

    // 7. 初始化推进器尾焰与爆炸/收集粒子系统
    this.particles = new ParticleSystem();

    // 8. 初始化玩家宇宙飞船实体与生命值系统
    this.player = new Player(this.viewport.width, this.viewport.height);
    this.health = new PlayerHealth();

    // 9. 初始化陨石与能量晶体生成及独立对象池管理系统
    this.spawner = new SpawnSystem(this.viewport.width, this.viewport.height);

    // 10. 初始化碰撞检测与事件分发系统
    this.collision = new CollisionSystem();

    // 11. 初始化积分与动态难度递增系统（初始默认处于 MENU，不开始计分）
    this.scoreManager = new ScoreManager();
    this.scoreManager.stopScoring();
    this.difficulty = new DifficultySystem();
    this.difficulty.applyToSpawner(this.spawner);

    // 暴露独立对象池快捷引用
    this.meteorPool = this.spawner.meteorPool;
    this.crystalPool = this.spawner.crystalPool;

    // 屏幕轻微受击震动状态
    this._shakeTimer = 0;
    this._shakeDuration = 0;
    this._shakeIntensity = 0;
    this._lastTelemetryText = '';

    // 12. 初始化全局 UI 与交互管理器
    this.ui = new UIManager({
      storage: this.storage,
      sound: this.sound,
      callbacks: {
        onStartGame: () => this.startGame(),
        onResumeGame: () => this.resume(),
        onRestartGame: () => this.restart(),
        onReturnToMenu: () => this.returnToMenu()
      }
    });

    // 13. 初始化全局唯一的主循环（禁止在开始/重启/切状态时创建第二个 GameLoop）
    this.loop = new GameLoop(
      (deltaTime, elapsedTime) => this.update(deltaTime, elapsedTime),
      (deltaTime, elapsedTime) => this.render(deltaTime, elapsedTime),
      { maxDeltaTime: GAME_CONFIG.VIEWPORT.MAX_DELTA_TIME }
    );

    // 绑定所有子系统事件（仅在构造函数中注册一次，避免重复监听）
    this._bindSystemEvents();
    this._syncHudAll();
    this.ui.syncScreenWithState(this.gameState.current);
  }

  /**
   * 获取当前游戏状态 (MENU | PLAYING | PAUSED | GAME_OVER)
   * @returns {string}
   */
  get state() {
    return this.gameState.current;
  }

  /**
   * 设置游戏状态并自动同步 UI
   * @param {string} nextState
   */
  set state(nextState) {
    if (this.gameState.setState(nextState)) {
      this.ui.syncScreenWithState(nextState);
    }
  }

  /**
   * 绑定各子系统事件（仅注册一次）
   */
  _bindSystemEvents() {
    // 1. 窗口尺寸缩放同步
    this._unsubscribeResize = this.viewport.onResize((width, height) => {
      this.background.resize(width, height);
      this.player.resize(width, height);
      this.spawner.resize(width, height);
      this.render(0, this.loop.elapsedTime);
    });

    // 2. P / ESC 键处理：若二级模态框打开则优先关闭模态框，否则在 PLAYING / PAUSED 间切换
    this._unsubscribePause = this.input.onPauseToggle((event) => {
      if (event.code === 'Escape') {
        if (this.ui.activeModal === 'HOW_TO_PLAY') {
          this.sound.playButtonClick();
          this.ui.closeHowToPlay();
          return;
        }
        if (this.ui.activeModal === 'SETTINGS') {
          this.sound.playButtonClick();
          this.ui.closeSettings();
          return;
        }
      }

      if (this.gameState.isPlaying() || this.gameState.isPaused()) {
        this.togglePause();
      }
    });

    // 3. 玩家碰撞陨石事件 -> 播放岩石碎裂音效并触发 PlayerHealth.takeDamage()
    this._unsubscribeMeteorHit = this.collision.onMeteorHit((hitEvent) => {
      if (!this.gameState.isPlaying()) return;

      this.sound.playMeteorCollision();
      const didTakeDamage = this.health.takeDamage(1, hitEvent);
      if (didTakeDamage) {
        if (!this.health.isDead()) {
          this.sound.playPlayerHit();
          this.player.triggerHitFeedback(this.health.invincibleDuration);
          this.triggerScreenShake(7, 0.24);
        } else {
          this.triggerScreenShake(13, 0.36);
        }
      }
    });

    // 4. 玩家收集能量晶体事件 -> 触发 ScoreManager.addScore(10)
    this._unsubscribeCrystalCollect = this.collision.onCrystalCollect((collectEvent) => {
      if (!this.gameState.isPlaying()) return;
      const points = collectEvent.scoreValue || GAME_CONFIG.CRYSTAL.SCORE_VALUE || 10;
      this.sound.playCrystalCollect();
      this.scoreManager.addScore(points, 'CRYSTAL');
    });

    // 5. 生命值变化与死亡事件绑定
    this._unsubscribeHealthChange = this.health.onHealthChange(() => {
      this.ui.syncHealth(this.health.currentHealth, this.health.maxHealth);
    });

    this._unsubscribeDeath = this.health.onDeath(() => {
      this.triggerGameOver();
    });

    // 6. 积分变化事件绑定
    this._unsubscribeScoreChange = this.scoreManager.onScoreChange(({ score }) => {
      if (score > this.highScore) {
        this.highScore = score;
        this.isNewRecord = true;
      }
      this.ui.syncScore(score, this.highScore);
    });

    // 7. 难度提升事件绑定
    this._unsubscribeLevelUp = this.difficulty.onLevelUp((payload) => {
      this.sound.playLevelUp();
      this.ui.syncDifficulty(this.difficulty.getStatus());
      this.ui.showLevelUpBanner(payload);
    });

    // 8. 快捷键 R 重新开始支持（在 PAUSED 或 GAME_OVER 状态下生效）
    this._handleGlobalKeyDown = (event) => {
      if (event.repeat || this.ui.activeModal) return;
      if (event.code === 'KeyR') {
        if (this.gameState.isGameOver() || this.gameState.isPaused()) {
          event.preventDefault();
          this.sound.playGameStart();
          this.restart();
        }
      }
    };
    window.addEventListener('keydown', this._handleGlobalKeyDown);
  }

  /**
   * 触发轻微屏幕受击震动
   * @param {number} [intensity=7]
   * @param {number} [duration=0.24]
   */
  triggerScreenShake(intensity = 7, duration = 0.24) {
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
    this._shakeDuration = Math.max(0.01, duration);
    this._shakeTimer = Math.max(this._shakeTimer, duration);
  }

  /**
   * 启动主循环（初次进入网站保持在 MENU 状态，仅运行背景与菜单展示动画）
   */
  start() {
    this.loop.start();
    this._syncHudAll();
    this.ui.syncScreenWithState(this.gameState.current);
    this.render(0, this.loop.elapsedTime);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 停止主循环
   */
  stop() {
    this.loop.stop();
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 从主菜单正式开始游戏 (MENU -> PLAYING)
   */
  startGame() {
    this._resetGameplaySystems();
    this.gameState.setState(GAME_STATE.PLAYING);
    this.scoreManager.startScoring();

    if (!this.loop.isRunning) {
      this.loop.start();
    } else if (this.loop.isPaused) {
      this.loop.resume();
    }

    this._syncHudAll();
    this.ui.syncScreenWithState(GAME_STATE.PLAYING);
    this.render(0, this.loop.elapsedTime);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 暂停游戏 (PLAYING -> PAUSED)
   * 冻结游戏模拟（陨石、晶体、飞船、生成、积分、生存时间全部停止），但保持主循环继续渲染背景与暂停 UI
   */
  pause() {
    if (!this.gameState.isPlaying()) {
      return;
    }
    this.gameState.setState(GAME_STATE.PAUSED);
    this.scoreManager.stopScoring();
    this.input.reset();
    this.ui.syncScreenWithState(GAME_STATE.PAUSED);
    this.render(0, this.loop.elapsedTime);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 恢复游戏 (PAUSED -> PLAYING)
   */
  resume() {
    if (!this.gameState.isPaused()) {
      return;
    }
    this.gameState.setState(GAME_STATE.PLAYING);
    this.scoreManager.startScoring();
    if (this.loop.isPaused) {
      this.loop.resume();
    }
    this.ui.syncScreenWithState(GAME_STATE.PLAYING);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 切换暂停/继续状态
   * @returns {boolean} 切换后是否处于暂停状态
   */
  togglePause() {
    if (!this.loop.isRunning || this.gameState.isGameOver() || this.gameState.isMenu()) {
      return false;
    }
    if (this.gameState.isPaused()) {
      this.sound.playPauseToggle(false);
      this.resume();
    } else if (this.gameState.isPlaying()) {
      this.sound.playPauseToggle(true);
      this.pause();
    }
    return this.gameState.isPaused();
  }

  /**
   * 触发游戏结束 (PLAYING -> GAME_OVER)
   */
  triggerGameOver() {
    if (this.gameState.isGameOver()) {
      return;
    }

    const previousBest = this.storage.getHighScore();
    const finalScore = this.scoreManager.getScore();

    this.gameState.setState(GAME_STATE.GAME_OVER);
    this.scoreManager.stopScoring();
    this.input.reset();

    this.player.vx = 0;
    this.player.vy = 0;
    this.player.isMoving = false;
    this.player.invincibleTimer = 0;

    // 保存本局成绩并更新最高分
    const saveResult = this.storage.recordGameScore(finalScore);
    this.highScore = saveResult.highScore;
    this.isNewRecord = finalScore > previousBest && finalScore > 0;

    this.sound.playGameOver();

    this._syncHudAll();
    this.ui.populateGameOver({
      finalScore,
      highScore: this.highScore,
      survivalTime: this.scoreManager.getSurvivalTime(),
      difficultyLevel: this.difficulty.level,
      crystalsCollected: this.scoreManager.crystalsCollected,
      isNewRecord: this.isNewRecord
    });
    this.ui.syncScreenWithState(GAME_STATE.GAME_OVER);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 重新开始游戏 (PAUSED / GAME_OVER / PLAYING -> PLAYING)
   * 完整重置生命、积分、难度与三个对象池，绝不新建第二个 GameLoop
   */
  restart() {
    this.startGame();
  }

  /**
   * 返回主菜单 (PAUSED / GAME_OVER -> MENU)
   * 停止当前游戏并清理场内全部活动陨石、晶体与粒子，同时严格保留历史最高分与设置
   */
  returnToMenu() {
    this._resetGameplaySystems();
    this.scoreManager.stopScoring();
    this.gameState.setState(GAME_STATE.MENU);

    if (!this.loop.isRunning) {
      this.loop.start();
    } else if (this.loop.isPaused) {
      this.loop.resume();
    }

    this._syncHudAll();
    this.ui.syncScreenWithState(GAME_STATE.MENU);
    this.render(0, this.loop.elapsedTime);
    this._updateTelemetryDOM(0, this.loop.elapsedTime);
  }

  /**
   * 内部通用重置：恢复生命值 3、积分清零、难度恢复 LV.1、回收所有活跃对象池实例、重置飞船坐标
   */
  _resetGameplaySystems() {
    this.health.reset();
    this.scoreManager.reset();
    this.highScore = this.storage.getHighScore();
    this.isNewRecord = false;

    this.difficulty.reset(this.spawner);
    this.spawner.reset();
    this.particles.clear();
    this.collision.resetStats();

    this.player.resetPosition();
    this.input.reset();

    this._shakeTimer = 0;
    this._shakeIntensity = 0;
  }

  /**
   * 单帧逻辑更新（通过 GameState 控制模拟行为，保持唯一 GameLoop 持续运行）
   * @param {number} deltaTime
   * @param {number} elapsedTime
   */
  update(deltaTime, elapsedTime) {
    // 暂停状态下冻结一切逻辑更新，避免无意义计算
    if (this.gameState.isPaused()) {
      this._updateTelemetryDOM(deltaTime, elapsedTime);
      return;
    }

    // 1. 深空星云与视差星空背景在活跃状态下保持平滑动态滚动
    this.background.update(deltaTime);

    // 2. 更新 UI 动态组件（MENU 状态下驱动右侧大型宇宙飞船展示与尾焰微光）
    this.ui.update(deltaTime, this.gameState.current);

    // 3. 更新受击震屏衰减
    if (this._shakeTimer > 0) {
      this._shakeTimer = Math.max(0, this._shakeTimer - deltaTime);
      if (this._shakeTimer <= 0) {
        this._shakeIntensity = 0;
      }
    }

    // 4. 仅在 PLAYING 状态下执行游戏实体模拟、生成、碰撞与计分
    if (this.gameState.isPlaying()) {
      this.health.update(deltaTime);
      this.player.update(deltaTime, this.input);
      this.player.invincibleTimer = this.health.invincibleTimer;

      this.spawner.updateEntities(deltaTime);
      this.scoreManager.update(deltaTime);
      this.difficulty.update(this.scoreManager.getSurvivalTime(), this.spawner);
      this.spawner.updateSpawning(deltaTime, this.player);
      this.collision.update(this.player, this.spawner, this.particles);

      this.particles.emitPlayerThrusters(this.player, deltaTime);
      this.particles.update(deltaTime);
      this.ui.syncSurvivalTime(this.scoreManager.getSurvivalTime());
    } else if (this.gameState.isGameOver()) {
      // GAME_OVER 状态下允许场上残余爆炸粒子自然消散，但冻结一切移动与生成
      this.particles.update(deltaTime);
    }

    this._updateTelemetryDOM(deltaTime, elapsedTime);
  }

  /**
   * 单帧画面渲染
   * @param {number} _deltaTime
   * @param {number} _elapsedTime
   */
  render(_deltaTime, _elapsedTime) {
    const ctx = this.viewport.ctx;
    if (!ctx) return;

    this.viewport.applyTransform();
    this.viewport.clear();

    ctx.save();

    if (this._shakeTimer > 0 && this._shakeIntensity > 0) {
      const progress = this._shakeTimer / Math.max(0.01, this._shakeDuration);
      const currentMag = this._shakeIntensity * progress;
      ctx.translate(randomRange(-currentMag, currentMag), randomRange(-currentMag, currentMag));
    }

    // 1. 始终绘制深空渐变、三色星云与三层视差闪烁星空
    this.background.render(ctx);

    // 2. 仅在非 MENU 状态（即 PLAYING / PAUSED / GAME_OVER）下绘制战斗场景实体
    if (!this.gameState.isMenu()) {
      this.spawner.renderMeteors(ctx);
      this.spawner.renderCrystals(ctx);

      if (!this.health.isDead()) {
        this.player.render(ctx);
      }

      this.particles.render(ctx);
    }

    ctx.restore();
  }

  /**
   * 同步全部 HUD 显示数据
   */
  _syncHudAll() {
    this.ui.syncHealth(this.health.currentHealth, this.health.maxHealth);
    this.ui.syncScore(this.scoreManager.getScore(), this.highScore);
    this.ui.syncSurvivalTime(this.scoreManager.getSurvivalTime());
    this.ui.syncDifficulty(this.difficulty.getStatus());
  }

  /**
   * 更新顶部中央遥测状态文本
   */
  _updateTelemetryDOM(_deltaTime, _elapsedTime) {
    const el = this.ui.els.engineTelemetry;
    if (!el) return;

    const fps = Math.round(this.loop.fps);
    const stateText = this.gameState.current;
    const hpText = `${this.health.currentHealth}/${this.health.maxHealth}`;
    const score = this.scoreManager.getScore();
    const lv = this.difficulty.level;

    const nextText =
      `STATE: ${stateText} | FPS: ${fps} | HP: ${hpText} | SCORE: ${score} | BEST: ${this.highScore} | DIFF: LV.${lv}`;
    if (nextText !== this._lastTelemetryText) {
      this._lastTelemetryText = nextText;
      el.textContent = nextText;
    }
  }

  /**
   * 销毁游戏控制器并释放所有底层资源与事件监听
   */
  destroy() {
    if (this._unsubscribeResize) this._unsubscribeResize();
    if (this._unsubscribePause) this._unsubscribePause();
    if (this._unsubscribeMeteorHit) this._unsubscribeMeteorHit();
    if (this._unsubscribeCrystalCollect) this._unsubscribeCrystalCollect();
    if (this._unsubscribeHealthChange) this._unsubscribeHealthChange();
    if (this._unsubscribeDeath) this._unsubscribeDeath();
    if (this._unsubscribeScoreChange) this._unsubscribeScoreChange();
    if (this._unsubscribeLevelUp) this._unsubscribeLevelUp();

    window.removeEventListener('keydown', this._handleGlobalKeyDown);

    this.ui.destroy();
    this.sound.destroy();
    this.health.destroy();
    this.scoreManager.destroy();
    this.difficulty.destroy();
    this.gameState.destroy();
    this.collision.destroy();
    this.loop.destroy();
    this.input.destroy();
    this.viewport.destroy();
  }
}
