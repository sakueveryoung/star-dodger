/**
 * 《星际躲避者 (Star Dodger)》程序主入口
 * 阶段 5：完整游戏 UI、主菜单、操作说明、系统设置、电子音效合成器、暂停菜单与结算体验
 */
import { GAME_CONFIG, GAME_STATE } from './config/gameConfig.js';
import { Game } from './core/Game.js';
import { GameStateManager } from './core/GameState.js';
import { PlayerHealth } from './entities/PlayerHealth.js';
import { ScoreManager } from './systems/ScoreManager.js';
import { DifficultySystem } from './systems/DifficultySystem.js';
import { StorageManager } from './utils/StorageManager.js';
import { SoundManager } from './audio/SoundManager.js';
import { UIManager } from './ui/UIManager.js';
import { AnimationManager } from './ui/AnimationManager.js';
import { ObjectPool } from './utils/ObjectPool.js';
import * as mathUtils from './utils/math.js';

/**
 * 启动《星际躲避者》主控制器
 */
function bootstrapGame() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[Star Dodger] 启动失败：页面中未找到 #game-canvas 元素');
    return;
  }

  // 实例化游戏核心控制器并启动主循环（初次进入 MENU 主菜单状态）
  const game = new Game(canvas);
  game.start();

  // 挂载全局调试句柄，便于开发期与自动化控制台验收测试
  window.__STAR_DODGER__ = {
    game,
    config: GAME_CONFIG,
    GAME_STATE,
    GameStateManager,
    PlayerHealth,
    ScoreManager,
    DifficultySystem,
    StorageManager,
    SoundManager,
    UIManager,
    AnimationManager,
    ObjectPool,
    math: mathUtils
  };

  console.info(
    '[Star Dodger] v1.0.0 正式发布版 (Official Release) 已启动',
    {
      viewport: `${game.viewport.width}x${game.viewport.height} (DPR: ${game.viewport.dpr})`,
      state: game.state,
      settings: game.storage.getSettings(),
      highScore: game.highScore
    }
  );
}

// ES Module 默认延迟执行，若 DOM 已解析完成则立即启动，否则等待 DOMContentLoaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrapGame, { once: true });
} else {
  bootstrapGame();
}
