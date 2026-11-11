/**
 * 《星际躲避者 (Star Dodger)》陨石与能量晶体生成及池化管理系统
 * 职责：
 * 1. 维护相互独立的 Meteor 对象池与 Crystal 对象池（基于 ObjectPool 预热与复用）
 * 2. 独立管理陨石（初始 1.4s）与能量晶体（约 8s 随机）的生成计时器
 * 3. 动态计算顶部生成边界，并防止刚生成时贴脸直接与玩家碰撞
 * 4. 驱动活跃陨石与晶体的 deltaTime 更新、绘制及出界自动回收
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { randomRange, clamp, distanceSq } from '../utils/math.js';
import { Meteor } from '../entities/Meteor.js';
import { Crystal } from '../entities/Crystal.js';

export class SpawnSystem {
  /**
   * @param {number} viewportWidth 初始视口逻辑宽度
   * @param {number} viewportHeight 初始视口逻辑高度
   */
  constructor(viewportWidth, viewportHeight) {
    this.viewportWidth = Math.max(320, viewportWidth);
    this.viewportHeight = Math.max(240, viewportHeight);

    // 1. 创建独立的陨石对象池（预热 40 个实例）
    this.meteorPool = new ObjectPool(() => new Meteor(), {
      initialSize: GAME_CONFIG.POOL_SIZE.METEORS || 40,
      maxSize: 120
    });

    // 2. 创建独立的能量晶体对象池（预热 15 个实例）
    this.crystalPool = new ObjectPool(() => new Crystal(), {
      initialSize: GAME_CONFIG.POOL_SIZE.CRYSTALS || 15,
      maxSize: 40
    });

    // 生成控制参数（由配置文件统一驱动，并预留难度调节倍率）
    this.baseMeteorInterval = GAME_CONFIG.METEOR.BASE_SPAWN_INTERVAL || 1.4;
    this.currentMeteorInterval = this.baseMeteorInterval;
    this.meteorSpeedMultiplier = 1.0;

    // 独立生成计时器
    this._meteorTimer = 0;
    this._nextMeteorDelay = this._computeNextMeteorDelay();

    this._crystalTimer = 0;
    this._nextCrystalDelay = this._computeNextCrystalDelay();

    /** @type {number|null} 记录上一颗生成陨石的 X 坐标，防止高难度下连续同列堆叠封死躲避路线 */
    this._lastMeteorSpawnX = null;

    // 生成边界范围
    this.spawnBounds = {
      meteorMinX: 60,
      meteorMaxX: this.viewportWidth - 60,
      crystalMinX: 70,
      crystalMaxX: this.viewportWidth - 70
    };
    this._recalculateSpawnBounds();

    // 运行统计指标（用于对象池与生成回收验证）
    this.stats = {
      meteorsSpawned: 0,
      meteorsRecycledOffscreen: 0,
      meteorsRecycledCollision: 0,
      crystalsSpawned: 0,
      crystalsRecycledOffscreen: 0,
      crystalsRecycledCollected: 0
    };
  }

  /**
   * 根据视口宽度重新计算顶部有效生成 X 坐标范围
   */
  _recalculateSpawnBounds() {
    const mMargin = (GAME_CONFIG.METEOR.SPAWN_MARGIN_X || 48) + (GAME_CONFIG.METEOR.RADIUS_MAX || 42);
    const cMargin = (GAME_CONFIG.CRYSTAL.SPAWN_MARGIN_X || 60) + (GAME_CONFIG.CRYSTAL.RADIUS || 18);

    this.spawnBounds.meteorMinX = Math.min(mMargin, this.viewportWidth * 0.35);
    this.spawnBounds.meteorMaxX = Math.max(this.viewportWidth - mMargin, this.viewportWidth * 0.65);

    this.spawnBounds.crystalMinX = Math.min(cMargin, this.viewportWidth * 0.35);
    this.spawnBounds.crystalMaxX = Math.max(this.viewportWidth - cMargin, this.viewportWidth * 0.65);
  }

  /**
   * 计算下一次陨石生成间隔（围绕 1.4s 基准带微幅自然波动）
   * @returns {number}
   */
  _computeNextMeteorDelay() {
    const jitter = GAME_CONFIG.METEOR.SPAWN_JITTER ?? 0.15;
    const minInterval = GAME_CONFIG.METEOR.MIN_SPAWN_INTERVAL || 0.25;
    return Math.max(
      minInterval,
      this.currentMeteorInterval + randomRange(-jitter, jitter)
    );
  }

  /**
   * 计算下一次能量晶体生成间隔（8 秒左右，带适度随机性）
   * @returns {number}
   */
  _computeNextCrystalDelay() {
    const cfg = GAME_CONFIG.CRYSTAL;
    return randomRange(cfg.SPAWN_INTERVAL_MIN || 6.5, cfg.SPAWN_INTERVAL_MAX || 9.5);
  }

  /**
   * 重新初始化生成计时器（不清空已有对象，或供新局重置调用）
   */
  resetTimers() {
    this._meteorTimer = 0;
    this._nextMeteorDelay = this._computeNextMeteorDelay();
    this._crystalTimer = 0;
    this._nextCrystalDelay = this._computeNextCrystalDelay();

    /** @type {number|null} 记录上一颗生成陨石的 X 坐标，防止高难度下连续同列堆叠封死躲避路线 */
    this._lastMeteorSpawnX = null;
  }

  /**
   * 完整重置生成系统：回收全部活跃陨石与晶体，并重置生成计时器
   */
  reset() {
    this.meteorPool.releaseAll();
    this.crystalPool.releaseAll();
    this.currentMeteorInterval = this.baseMeteorInterval;
    this.meteorSpeedMultiplier = 1.0;
    this.resetTimers();
  }

  /**
   * 响应浏览器视口缩放，重新计算顶部生成边界并修正场内晶体的水平安全范围
   * @param {number} newWidth 新视口宽度
   * @param {number} newHeight 新视口高度
   */
  resize(newWidth, newHeight) {
    const validW = Math.max(320, newWidth);
    const validH = Math.max(240, newHeight);
    const ratioX = validW / this.viewportWidth;

    this.viewportWidth = validW;
    this.viewportHeight = validH;
    this._recalculateSpawnBounds();

    // 按比例平滑映射场内活跃陨石与晶体的 X 坐标
    this.meteorPool.forEachActive((meteor) => {
      meteor.x = clamp(meteor.x * ratioX, meteor.radius, this.viewportWidth - meteor.radius);
    });
    this.crystalPool.forEachActive((crystal) => {
      crystal.x = clamp(crystal.x * ratioX, crystal.radius + 20, this.viewportWidth - crystal.radius - 20);
    });
  }

  /**
   * 选择一个不会在生成瞬间与玩家飞船直接发生碰撞的安全顶部 X 坐标
   * @param {number} minX 最小允许 X
   * @param {number} maxX 最大允许 X
   * @param {number} spawnY 生成的 Y 坐标
   * @param {number} entityRadius 生成实体的半径
   * @param {import('../entities/Player.js').Player} [player] 玩家飞船实例
   * @returns {number} 安全的 X 坐标
   */
  _pickSafeSpawnX(minX, maxX, spawnY, entityRadius, player) {
    if (!player) {
      return randomRange(minX, maxX);
    }

    const safeDistance =
      (GAME_CONFIG.METEOR.PLAYER_SAFE_DISTANCE || 190) + entityRadius + (player.radius || 26);
    const safeDistSq = safeDistance * safeDistance;

    // 最多尝试 10 次随机采样，找到距离玩家大于安全阈值且与上一颗陨石保持横向错开的 X 坐标
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidateX = randomRange(minX, maxX);
      const farFromPlayer = !player || distanceSq(candidateX, spawnY, player.x, player.y) >= safeDistSq;
      const farFromLastMeteor =
        this._lastMeteorSpawnX === null || Math.abs(candidateX - this._lastMeteorSpawnX) >= 110;
      if (farFromPlayer && farFromLastMeteor) {
        return candidateX;
      }
    }

    // 若玩家正好紧贴顶部中央，则选择距离玩家 X 最远的一侧生成
    const distToMin = Math.abs(player.x - minX);
    const distToMax = Math.abs(player.x - maxX);
    return distToMin > distToMax
      ? randomRange(minX, Math.min(maxX, minX + 80))
      : randomRange(Math.max(minX, maxX - 80), maxX);
  }

  /**
   * 在屏幕顶部随机生成一颗陨石
   * @param {import('../entities/Player.js').Player} [player] 玩家飞船实例
   * @param {Object} [overrideOptions] 可选覆盖参数（用于测试或特殊生成）
   * @returns {Meteor|null}
   */
  spawnMeteor(player, overrideOptions = {}) {
    const cfg = GAME_CONFIG.METEOR;
    const radius = overrideOptions.radius ?? randomRange(cfg.RADIUS_MIN, cfg.RADIUS_MAX);
    const spawnY = overrideOptions.y ?? -(radius + 14);
    const spawnX =
      overrideOptions.x ??
      this._pickSafeSpawnX(
        this.spawnBounds.meteorMinX,
        this.spawnBounds.meteorMaxX,
        spawnY,
        radius,
        player
      );

    const meteor = this.meteorPool.acquire({
      x: spawnX,
      y: spawnY,
      radius,
      speedMultiplier: this.meteorSpeedMultiplier,
      ...overrideOptions
    });

    if (meteor) {
      this._lastMeteorSpawnX = meteor.x;
      this.stats.meteorsSpawned++;
    }
    return meteor;
  }

  /**
   * 在屏幕顶部随机生成一颗能量晶体
   * @param {import('../entities/Player.js').Player} [player] 玩家飞船实例
   * @param {Object} [overrideOptions] 可选覆盖参数
   * @returns {Crystal|null}
   */
  spawnCrystal(player, overrideOptions = {}) {
    const cfg = GAME_CONFIG.CRYSTAL;
    const radius = overrideOptions.radius ?? (cfg.RADIUS || 18);
    const spawnY = overrideOptions.y ?? -(radius + 16);
    const spawnX =
      overrideOptions.x ??
      this._pickSafeSpawnX(
        this.spawnBounds.crystalMinX,
        this.spawnBounds.crystalMaxX,
        spawnY,
        radius,
        player
      );

    const crystal = this.crystalPool.acquire({
      x: spawnX,
      y: spawnY,
      radius,
      ...overrideOptions
    });

    if (crystal) {
      this.stats.crystalsSpawned++;
    }
    return crystal;
  }

  /**
   * 回收指定陨石到对象池
   * @param {Meteor} meteor
   * @param {'offscreen'|'collision'} [reason='collision']
   * @returns {boolean}
   */
  releaseMeteor(meteor, reason = 'collision') {
    const released = this.meteorPool.release(meteor);
    if (released) {
      if (reason === 'offscreen') {
        this.stats.meteorsRecycledOffscreen++;
      } else {
        this.stats.meteorsRecycledCollision++;
      }
    }
    return released;
  }

  /**
   * 回收指定能量晶体到对象池
   * @param {Crystal} crystal
   * @param {'offscreen'|'collected'} [reason='collected']
   * @returns {boolean}
   */
  releaseCrystal(crystal, reason = 'collected') {
    const released = this.crystalPool.release(crystal);
    if (released) {
      if (reason === 'offscreen') {
        this.stats.crystalsRecycledOffscreen++;
      } else {
        this.stats.crystalsRecycledCollected++;
      }
    }
    return released;
  }

  /**
   * 更新活跃的陨石与能量晶体位置，并自动回收飞出屏幕的对象
   * @param {number} deltaTime 帧间隔（秒）
   */
  updateEntities(deltaTime) {
    // 1. 更新所有活跃陨石
    this.meteorPool.forEachActive((meteor) => {
      const stillInBounds = meteor.update(deltaTime, this.viewportWidth, this.viewportHeight);
      if (!stillInBounds) {
        this.releaseMeteor(meteor, 'offscreen');
      }
    });

    // 2. 更新所有活跃能量晶体
    this.crystalPool.forEachActive((crystal) => {
      const stillInBounds = crystal.update(deltaTime, this.viewportWidth, this.viewportHeight);
      if (!stillInBounds) {
        this.releaseCrystal(crystal, 'offscreen');
      }
    });
  }

  /**
   * 更新生成计时器并按间隔生成陨石和能量晶体
   * @param {number} deltaTime 帧间隔（秒）
   * @param {import('../entities/Player.js').Player} player 玩家飞船实例
   */
  updateSpawning(deltaTime, player) {
    // 1. 独立更新陨石生成计时器（初始 1.4 秒间隔）
    this._meteorTimer += deltaTime;
    while (this._meteorTimer >= this._nextMeteorDelay) {
      this._meteorTimer -= this._nextMeteorDelay;
      this.spawnMeteor(player);
      this._nextMeteorDelay = this._computeNextMeteorDelay();
    }

    // 2. 独立更新能量晶体生成计时器（8 秒左右随机间隔）
    this._crystalTimer += deltaTime;
    while (this._crystalTimer >= this._nextCrystalDelay) {
      this._crystalTimer -= this._nextCrystalDelay;
      this.spawnCrystal(player);
      this._nextCrystalDelay = this._computeNextCrystalDelay();
    }
  }

  /**
   * 绘制所有活跃陨石
   * @param {CanvasRenderingContext2D} ctx
   */
  renderMeteors(ctx) {
    if (!ctx || this.meteorPool.activeCount === 0) return;
    this.meteorPool.forEachActive((meteor) => {
      meteor.render(ctx);
    });
  }

  /**
   * 绘制所有活跃能量晶体
   * @param {CanvasRenderingContext2D} ctx
   */
  renderCrystals(ctx) {
    if (!ctx || this.crystalPool.activeCount === 0) return;
    this.crystalPool.forEachActive((crystal) => {
      crystal.render(ctx);
    });
  }

  /**
   * 获取两个独立对象池及生成回收的完整统计快照
   */
  getStats() {
    return {
      meteorPool: this.meteorPool.getStats(),
      crystalPool: this.crystalPool.getStats(),
      counters: { ...this.stats },
      timers: {
        meteorTimer: +this._meteorTimer.toFixed(2),
        nextMeteorDelay: +this._nextMeteorDelay.toFixed(2),
        crystalTimer: +this._crystalTimer.toFixed(2),
        nextCrystalDelay: +this._nextCrystalDelay.toFixed(2)
      }
    };
  }
}
