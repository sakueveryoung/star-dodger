/**
 * 《星际躲避者 (Star Dodger)》Phase 6 核心模块自动化单元测试套件
 * 覆盖模块：
 * 1. GameState 状态切换
 * 2. PlayerHealth 扣血逻辑
 * 3. 无敌时间 (1.2s) 逻辑
 * 4. ScoreManager 生存得分与晶体积分
 * 5. DifficultySystem 难度计算 (20s / 60s / 100s / 160s / 220s)
 * 6. StorageManager 最高分与设置存取（含异常数据清洗与内存降级）
 * 7. ObjectPool 对象获取、回收、防重复回收与遍历安全
 * 8. math.js 圆形碰撞与向量归一化等数学工具函数
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { GameStateManager, GAME_STATE } from '../src/core/GameState.js';
import { PlayerHealth } from '../src/entities/PlayerHealth.js';
import { ScoreManager } from '../src/systems/ScoreManager.js';
import { DifficultySystem } from '../src/systems/DifficultySystem.js';
import { StorageManager } from '../src/utils/StorageManager.js';
import { ObjectPool } from '../src/utils/ObjectPool.js';
import {
  clamp,
  lerp,
  distance,
  distanceSq,
  normalizeVector,
  checkCircleCollision,
  randomRange,
  randomInt,
  randomChoice
} from '../src/utils/math.js';

describe('1. GameStateManager 状态切换测试', () => {
  it('默认初始状态应为 MENU，并正确支持全部合法状态流转', () => {
    const gsm = new GameStateManager();
    assert.equal(gsm.current, GAME_STATE.MENU);
    assert.equal(gsm.isMenu(), true);

    const history = [];
    const unsub = gsm.onChange((next, prev) => {
      history.push(`${prev}->${next}`);
    });

    // MENU -> PLAYING
    assert.equal(gsm.canTransitionTo(GAME_STATE.PLAYING), true);
    assert.equal(gsm.setState(GAME_STATE.PLAYING), true);
    assert.equal(gsm.isPlaying(), true);

    // PLAYING -> PAUSED -> PLAYING
    assert.equal(gsm.setState(GAME_STATE.PAUSED), true);
    assert.equal(gsm.isPaused(), true);
    assert.equal(gsm.setState(GAME_STATE.PLAYING), true);
    assert.equal(gsm.isPlaying(), true);

    // PLAYING -> GAME_OVER -> MENU
    assert.equal(gsm.setState(GAME_STATE.GAME_OVER), true);
    assert.equal(gsm.isGameOver(), true);
    assert.equal(gsm.setState(GAME_STATE.MENU), true);
    assert.equal(gsm.isMenu(), true);

    assert.deepEqual(history, [
      'MENU->PLAYING',
      'PLAYING->PAUSED',
      'PAUSED->PLAYING',
      'PLAYING->GAME_OVER',
      'GAME_OVER->MENU'
    ]);

    unsub();
    gsm.destroy();
  });

  it('重复设置相同状态或非法状态时应返回 false 且不触发回调', () => {
    const gsm = new GameStateManager(GAME_STATE.PLAYING);
    let callCount = 0;
    gsm.onChange(() => {
      callCount++;
    });

    assert.equal(gsm.setState(GAME_STATE.PLAYING), false);
    assert.equal(gsm.setState('INVALID_STATE'), false);
    assert.equal(callCount, 0);
    assert.equal(gsm.current, GAME_STATE.PLAYING);
  });
});

describe('2. PlayerHealth 扣血逻辑测试', () => {
  it('初始应有 3 格生命值，每次有效受击扣 1 格直至 0 触发死亡且不出现负数', () => {
    const health = new PlayerHealth({ initialHealth: 3, maxHealth: 3, invincibleDuration: 1.2 });
    assert.equal(health.currentHealth, 3);
    assert.equal(health.isDead(), false);

    let damageEvents = 0;
    let deathEvents = 0;
    health.onDamage(() => damageEvents++);
    health.onDeath(() => deathEvents++);

    // 第 1 次受击：3 -> 2
    assert.equal(health.takeDamage(1), true);
    assert.equal(health.currentHealth, 2);
    assert.equal(health.isDead(), false);

    // 度过无敌时间后第 2 次受击：2 -> 1
    health.update(1.25);
    assert.equal(health.takeDamage(1), true);
    assert.equal(health.currentHealth, 1);
    assert.equal(health.isDead(), false);

    // 度过无敌时间后第 3 次受击：1 -> 0 (触发死亡)
    health.update(1.25);
    assert.equal(health.takeDamage(1), true);
    assert.equal(health.currentHealth, 0);
    assert.equal(health.isDead(), true);
    assert.equal(damageEvents, 3);
    assert.equal(deathEvents, 1);

    // 死亡后再次受击应被忽略，生命值保持为 0
    assert.equal(health.takeDamage(1), false);
    assert.equal(health.currentHealth, 0);
    assert.equal(deathEvents, 1);

    // reset() 应恢复为 3 格生命
    health.reset();
    assert.equal(health.currentHealth, 3);
    assert.equal(health.isDead(), false);
  });
});

describe('3. PlayerHealth 1.2秒无敌时间逻辑测试', () => {
  it('受击后应立即进入 1.2 秒无敌保护，期间重复碰撞不扣血，倒计时结束后恢复可受击', () => {
    const health = new PlayerHealth({ initialHealth: 3, maxHealth: 3, invincibleDuration: 1.2 });

    assert.equal(health.isInvincible, false);
    assert.equal(health.takeDamage(1), true);
    assert.equal(health.currentHealth, 2);
    assert.equal(health.isInvincible, true);
    assert.ok(Math.abs(health.invincibleTimer - 1.2) < 1e-6);

    // 0.5 秒后仍处于无敌状态，受击应返回 false 且生命值不变
    health.update(0.5);
    assert.equal(health.isInvincible, true);
    assert.equal(health.takeDamage(1), false);
    assert.equal(health.currentHealth, 2);

    // 再经过 0.69 秒（共 1.19 秒）仍处于无敌状态
    health.update(0.69);
    assert.equal(health.isInvincible, true);
    assert.equal(health.takeDamage(1), false);
    assert.equal(health.currentHealth, 2);

    // 再经过 0.02 秒（共 1.21 秒），无敌结束，可正常受击
    health.update(0.02);
    assert.equal(health.isInvincible, false);
    assert.equal(health.invincibleTimer, 0);
    assert.equal(health.takeDamage(1), true);
    assert.equal(health.currentHealth, 1);
  });
});

describe('4. ScoreManager 生存得分与晶体积分测试', () => {
  it('每生存满 1 秒增加 1 分（支持小数帧结转），每收集 1 颗能量晶体增加 10 分', () => {
    const sm = new ScoreManager();
    assert.equal(sm.getScore(), 0);
    assert.equal(sm.getSurvivalTime(), 0);

    // 模拟 4 帧各 0.3s -> 累计 1.2s -> 应获得 1 分生存分，余 0.2s 结转
    sm.update(0.3);
    sm.update(0.3);
    sm.update(0.3);
    assert.equal(sm.getScore(), 0);
    sm.update(0.3);
    assert.equal(sm.getScore(), 1);
    assert.ok(Math.abs(sm.getSurvivalTime() - 1.2) < 1e-6);

    // 收集 2 颗能量晶体 -> +20 分 -> 总分 21
    sm.addScore(10, 'CRYSTAL');
    sm.addScore(10, 'CRYSTAL');
    assert.equal(sm.getScore(), 21);
    assert.equal(sm.crystalsCollected, 2);
    assert.equal(sm.crystalPointsEarned, 20);

    // 再经过 0.8s -> 累计 2.0s -> 生存分再 +1 -> 总分 22
    sm.update(0.8);
    assert.equal(sm.getScore(), 22);
    assert.equal(sm.survivalPointsEarned, 2);
  });

  it('stopScoring 暂停期间生存时间与积分应完全冻结，reset 应清零全部状态', () => {
    const sm = new ScoreManager();
    sm.update(2.0);
    assert.equal(sm.getScore(), 2);

    sm.stopScoring();
    sm.update(5.0);
    sm.addScore(10, 'CRYSTAL');
    assert.equal(sm.getScore(), 2);
    assert.ok(Math.abs(sm.getSurvivalTime() - 2.0) < 1e-6);

    sm.startScoring();
    sm.update(1.0);
    assert.equal(sm.getScore(), 3);

    sm.reset();
    assert.equal(sm.getScore(), 0);
    assert.equal(sm.getSurvivalTime(), 0);
    assert.equal(sm.crystalsCollected, 0);
  });
});

describe('5. DifficultySystem 动态难度递增计算测试', () => {
  it('应在 20s / 60s / 100s / 160s / 220s 准确升级并遵守间隔下限 0.6s 与速度上限 2.0x', () => {
    const diff = new DifficultySystem();
    const mockSpawner = { currentMeteorInterval: 1.4, meteorSpeedMultiplier: 1.0 };

    // 初始 0s: LV.1, 间隔 1.4s, 速度 1.0x
    assert.equal(diff.level, 1);
    assert.equal(diff.spawnInterval, 1.4);
    assert.equal(diff.speedMultiplier, 1.0);

    // 20s -> LV.2 (间隔 1.3s, 速度 1.12x)
    assert.equal(diff.update(20, mockSpawner), true);
    assert.equal(diff.level, 2);
    assert.equal(diff.spawnInterval, 1.3);
    assert.equal(diff.speedMultiplier, 1.12);
    assert.equal(mockSpawner.currentMeteorInterval, 1.3);

    // 60s -> LV.4 (间隔 1.1s, 速度 1.36x)
    assert.equal(diff.update(60, mockSpawner), true);
    assert.equal(diff.level, 4);
    assert.equal(diff.spawnInterval, 1.1);
    assert.equal(diff.speedMultiplier, 1.36);

    // 100s -> LV.6 (间隔 0.9s, 速度 1.60x)
    assert.equal(diff.update(100, mockSpawner), true);
    assert.equal(diff.level, 6);
    assert.equal(diff.spawnInterval, 0.9);
    assert.equal(diff.speedMultiplier, 1.6);

    // 160s -> LV.9 (间隔触底 0.6s, 速度 1.96x)
    assert.equal(diff.update(160, mockSpawner), true);
    assert.equal(diff.level, 9);
    assert.equal(diff.spawnInterval, 0.6);
    assert.equal(diff.speedMultiplier, 1.96);

    // 220s -> LV.12 (间隔保持下限 0.6s, 速度封顶 2.0x)
    assert.equal(diff.update(220, mockSpawner), true);
    assert.equal(diff.level, 12);
    assert.equal(diff.spawnInterval, 0.6);
    assert.equal(diff.speedMultiplier, 2.0);

    // 重置应回到 LV.1
    diff.reset(mockSpawner);
    assert.equal(diff.level, 1);
    assert.equal(diff.spawnInterval, 1.4);
    assert.equal(diff.speedMultiplier, 1.0);
  });
});

describe('6. StorageManager 最高分与设置存取测试', () => {
  let mockStore = {};

  beforeEach(() => {
    mockStore = {};
    globalThis.window = {
      localStorage: {
        getItem: (key) => (key in mockStore ? mockStore[key] : null),
        setItem: (key, val) => {
          mockStore[key] = String(val);
        },
        removeItem: (key) => {
          delete mockStore[key];
        }
      }
    };
  });

  it('应正确保存并更新历史最高分，低分不应覆盖已有最高分', () => {
    const storage = new StorageManager('test_star_dodger_v1');
    assert.equal(storage.getHighScore(), 0);

    const res1 = storage.recordGameScore(85);
    assert.equal(res1.highScore, 85);
    assert.equal(res1.lastScore, 85);
    assert.equal(res1.isNewRecord, true);

    const res2 = storage.recordGameScore(42);
    assert.equal(res2.highScore, 85);
    assert.equal(res2.lastScore, 42);
    assert.equal(res2.isNewRecord, false);

    const res3 = storage.recordGameScore(150);
    assert.equal(res3.highScore, 150);
    assert.equal(res3.isNewRecord, true);

    // 重新实例化后应能从持久化存储读取 150
    const reloaded = new StorageManager('test_star_dodger_v1');
    assert.equal(reloaded.getHighScore(), 150);
    assert.equal(reloaded.getLastScore(), 150);
  });

  it('恢复默认设置应重置音效开关与音量，但严格保留历史最高分；损坏数据应自动清洗', () => {
    const storage = new StorageManager('test_star_dodger_v1');
    storage.recordGameScore(260);
    storage.setSoundEnabled(false);
    storage.setMasterVolume(0.35);

    assert.equal(storage.isSoundEnabled(), false);
    assert.equal(storage.getMasterVolume(), 0.35);

    const restored = storage.restoreDefaultSettings();
    assert.equal(restored.soundEnabled, true);
    assert.equal(restored.masterVolume, 0.8);
    assert.equal(restored.highScore, 260);

    // 写入损坏 JSON 测试容错
    mockStore['test_corrupt_key'] = '{bad_json';
    const corruptStorage = new StorageManager('test_corrupt_key');
    assert.equal(corruptStorage.getHighScore(), 0);
    assert.equal(corruptStorage.isSoundEnabled(), true);
  });
});

describe('7. ObjectPool 对象池获取、回收与防重复回收测试', () => {
  it('应正确支持 acquire、release、防重复回收、动态扩容与遍历中安全回收', () => {
    let createdId = 0;
    const pool = new ObjectPool(
      () => ({ id: ++createdId, active: false, value: 0 }),
      {
        resetFn: (obj, val = 0) => {
          obj.active = true;
          obj.value = val;
        },
        initialSize: 3
      }
    );

    assert.equal(pool.freeCount, 3);
    assert.equal(pool.activeCount, 0);

    const a = pool.acquire(10);
    const b = pool.acquire(20);
    const c = pool.acquire(30);
    const d = pool.acquire(40); // 触发自动扩容
    assert.equal(pool.activeCount, 4);
    assert.equal(pool.freeCount, 0);
    assert.equal(d.value, 40);

    // 回收对象 a，并验证重复回收同一对象返回 false 且不会污染空闲池
    assert.equal(pool.release(a), true);
    assert.equal(pool.release(a), false);
    assert.equal(pool.activeCount, 3);
    assert.equal(pool.freeCount, 1);

    // 在 forEachActive 遍历中安全回收对象
    pool.forEachActive((item) => {
      if (item.value === 20) {
        pool.release(item);
      }
    });
    assert.equal(pool.activeCount, 2);

    // releaseAll 批量回收
    pool.releaseAll();
    assert.equal(pool.activeCount, 0);
    assert.equal(pool.freeCount, 4);
  });
});

describe('8. math.js 圆形碰撞与向量函数测试', () => {
  it('checkCircleCollision 应准确判定相交、相切与分离状态', () => {
    // 圆心距离 50，半径之和 30 + 25 = 55 -> 相交 (true)
    assert.equal(checkCircleCollision(0, 0, 30, 30, 40, 25), true);
    // 圆心距离 50，半径之和 30 + 20 = 50 -> 相切边界 (true)
    assert.equal(checkCircleCollision(0, 0, 30, 30, 40, 20), true);
    // 圆心距离 50，半径之和 20 + 20 = 40 -> 分离 (false)
    assert.equal(checkCircleCollision(0, 0, 20, 30, 40, 20), false);
  });

  it('normalizeVector 应将任意非零向量归一化为单位向量，零向量安全返回 0', () => {
    const zero = normalizeVector(0, 0);
    assert.equal(zero.x, 0);
    assert.equal(zero.y, 0);
    assert.equal(zero.length, 0);

    const diag = normalizeVector(1, 1);
    assert.ok(Math.abs(diag.x - Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(diag.y - Math.SQRT1_2) < 1e-6);
    assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-6);
  });

  it('clamp、lerp、distance、distanceSq、randomRange、randomInt、randomChoice 应全部正确工作', () => {
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(6, 0, 10), 6);

    assert.equal(lerp(10, 20, 0.5), 15);
    assert.equal(lerp(10, 20, 2.0), 20);

    assert.equal(distanceSq(0, 0, 3, 4), 25);
    assert.equal(distance(0, 0, 3, 4), 5);

    for (let i = 0; i < 20; i++) {
      const r = randomRange(5, 10);
      assert.ok(r >= 5 && r < 10);
      const ri = randomInt(1, 3);
      assert.ok(ri >= 1 && ri <= 3 && Number.isInteger(ri));
    }

    assert.equal(randomChoice([]), undefined);
    assert.ok(['a', 'b'].includes(randomChoice(['a', 'b'])));
  });
});
