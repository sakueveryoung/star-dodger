/**
 * 《星际躲避者 (Star Dodger)》粒子特效系统 (Phase 6 视觉与性能优化版)
 * 基于通用 ObjectPool 管理推进器尾焰、定向陨石碰撞碎片、双层晶体收集冲击环与高辨识度 +10 飘字
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { randomRange, randomChoice, lerp } from '../utils/math.js';
import { Particle } from '../entities/Particle.js';

const IDLE_FLAME_COLORS = ['#21E6FF', '#00B8FF', '#0077FF'];
const MOVE_FLAME_COLORS = ['#21E6FF', '#21E6FF', '#0099FF', '#38D6FF', '#895CFF', '#FF3BA7'];
const METEOR_EXPLOSION_COLORS = ['#895CFF', '#E066FF', '#FF3BA7', '#6272A4', '#21E6FF'];
const CRYSTAL_BURST_COLORS = ['#21E6FF', '#21E6FF', '#895CFF', '#FF3BA7', '#EDF8FF'];

export class ParticleSystem {
  constructor() {
    const cfg = GAME_CONFIG.PARTICLE;
    this.maxActive = cfg.MAX_ACTIVE || 360;

    // 使用已有 ObjectPool 预分配粒子实例，消除运行期 GC 抖动
    this.pool = new ObjectPool(() => new Particle(), {
      initialSize: GAME_CONFIG.POOL_SIZE.PARTICLES || 360,
      maxSize: this.maxActive + 40
    });

    /** @type {number} 粒子发射时间累加器 */
    this._emitAccumulator = 0;

    /** @type {number} 累计已自动回收的粒子总数 */
    this.totalRecycled = 0;

    /** @type {number} 累计已生成的粒子总数 */
    this.totalSpawned = 0;
  }

  /**
   * 根据玩家飞船双推进器状态持续发射尾焰粒子
   * @param {import('../entities/Player.js').Player} player 玩家飞船实例
   * @param {number} deltaTime 帧间隔（秒）
   */
  emitPlayerThrusters(player, deltaTime) {
    if (!player) return;

    const cfg = GAME_CONFIG.PARTICLE;
    const isMoving = player.isMoving;
    const speedRatio = player.getSpeedRatio();

    const emitRatePerNozzle = lerp(cfg.IDLE_EMIT_RATE, cfg.MOVE_EMIT_RATE, isMoving ? Math.max(0.65, speedRatio) : 0);
    this._emitAccumulator += emitRatePerNozzle * deltaTime;

    const emitCount = Math.floor(this._emitAccumulator);
    if (emitCount <= 0) {
      return;
    }
    this._emitAccumulator -= emitCount;

    const nozzles = player.getThrusterPositions();

    for (let i = 0; i < emitCount; i++) {
      for (let n = 0; n < nozzles.length; n++) {
        if (this.pool.activeCount >= this.maxActive) {
          return;
        }
        const nozzle = nozzles[n];
        this._spawnThrusterParticle(nozzle.x, nozzle.y, player, isMoving, speedRatio);
      }
    }
  }

  _spawnThrusterParticle(nozzleX, nozzleY, player, isMoving, speedRatio) {
    const cfg = GAME_CONFIG.PARTICLE;

    const baseVy = isMoving
      ? randomRange(cfg.MOVE_SPEED_MIN, cfg.MOVE_SPEED_MAX) * (0.85 + speedRatio * 0.3)
      : randomRange(cfg.IDLE_SPEED_MIN, cfg.IDLE_SPEED_MAX);

    const spreadVx = randomRange(-cfg.SPREAD_X, cfg.SPREAD_X) - player.vx * 0.14;
    const ejectVy = baseVy + (player.vy < 0 ? -player.vy * 0.25 : 0);

    const size = isMoving
      ? randomRange(cfg.SIZE_MIN * 1.15, cfg.SIZE_MAX)
      : randomRange(cfg.SIZE_MIN * 0.8, cfg.SIZE_MAX * 0.68);

    const maxLife = isMoving
      ? randomRange(cfg.LIFE_MIN * 1.1, cfg.LIFE_MAX)
      : randomRange(cfg.LIFE_MIN * 0.75, cfg.LIFE_MAX * 0.65);

    const color = isMoving
      ? randomChoice(MOVE_FLAME_COLORS)
      : randomChoice(IDLE_FLAME_COLORS);

    this.pool.acquire({
      type: 'dot',
      x: nozzleX + randomRange(-2.2, 2.2),
      y: nozzleY + randomRange(-1.5, 2.5),
      vx: spreadVx,
      vy: ejectVy,
      size,
      alpha: isMoving ? randomRange(0.78, 0.98) : randomRange(0.52, 0.75),
      maxLife,
      color,
      coreColor: '#EDF8FF',
      drag: isMoving ? 1.6 : 2.2,
      shrinkRatio: 0.1
    });

    this.totalSpawned++;
  }

  /**
   * 陨石碰撞后触发带方向性的岩石碎片与能量冲击环特效
   * @param {number} x 碰撞中心 X
   * @param {number} y 碰撞中心 Y
   * @param {number} [meteorRadius=28] 陨石半径
   * @param {number} [dirX=0] 碰撞冲击主方向 X 分量
   * @param {number} [dirY=1] 碰撞冲击主方向 Y 分量
   */
  emitMeteorExplosion(x, y, meteorRadius = 28, dirX = 0, dirY = 1) {
    const burstCount = 24;
    const baseAngle = Math.atan2(dirY || 1, dirX || 0);

    // 1. 发射扩散能量冲击光环
    if (this.pool.activeCount < this.maxActive) {
      this.pool.acquire({
        type: 'ring',
        x,
        y,
        vx: 0,
        vy: 0,
        size: meteorRadius * 0.42,
        maxRadius: meteorRadius * 2.45,
        alpha: 0.92,
        maxLife: 0.38,
        color: '#FF3BA7',
        drag: 0
      });
      this.totalSpawned++;
    }

    // 2. 发射具有明显碰撞方向性的多边形岩石碎片 (shard) 与高能火花 (dot)
    for (let i = 0; i < burstCount; i++) {
      if (this.pool.activeCount >= this.maxActive) {
        break;
      }

      // 60% 碎片沿碰撞冲击扇区方向高速飞溅，40% 径向散射
      const isDirectional = i < Math.floor(burstCount * 0.6);
      const angle = isDirectional
        ? baseAngle + randomRange(-0.85, 0.85)
        : (Math.PI * 2 * i) / burstCount + randomRange(-0.2, 0.2);

      const speed = (isDirectional ? randomRange(135, 310) : randomRange(75, 220)) * (meteorRadius / 28);
      const isShard = i % 2 === 0;

      this.pool.acquire({
        type: isShard ? 'shard' : 'dot',
        x: x + randomRange(-4, 4),
        y: y + randomRange(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: isShard ? randomRange(3.4, 6.8) : randomRange(2.6, 5.6),
        alpha: randomRange(0.88, 1.0),
        maxLife: randomRange(0.3, 0.6),
        color: randomChoice(METEOR_EXPLOSION_COLORS),
        coreColor: '#EDF8FF',
        drag: isShard ? 2.1 : 2.6,
        shrinkRatio: 0.12,
        rotation: randomRange(0, Math.PI * 2),
        rotationSpeed: randomRange(-8, 8)
      });
      this.totalSpawned++;
    }
  }

  /**
   * 能量晶体被收集后触发双层扩散冲击环、能量爆发与高辨识度 +10 飘字特效
   * @param {number} x 收集位置 X
   * @param {number} y 收集位置 Y
   * @param {number} [scoreValue=10] 分值显示
   */
  emitCrystalCollectBurst(x, y, scoreValue = 10) {
    const burstCount = 20;

    // 1. 外层霓虹青高速扩散冲击环
    if (this.pool.activeCount < this.maxActive) {
      this.pool.acquire({
        type: 'ring',
        x,
        y,
        vx: 0,
        vy: 0,
        size: 8,
        maxRadius: 62,
        alpha: 0.96,
        maxLife: 0.4,
        color: '#21E6FF',
        drag: 0
      });
      this.totalSpawned++;
    }

    // 2. 内层霓虹粉次级能量扩散环（增强收集成功视觉辨识度）
    if (this.pool.activeCount < this.maxActive) {
      this.pool.acquire({
        type: 'ring',
        x,
        y,
        vx: 0,
        vy: 0,
        size: 4,
        maxRadius: 42,
        alpha: 0.88,
        maxLife: 0.32,
        color: '#FF3BA7',
        drag: 0
      });
      this.totalSpawned++;
    }

    // 3. 高对比度上浮得分提示文字粒子 (+10)
    if (this.pool.activeCount < this.maxActive) {
      this.pool.acquire({
        type: 'text',
        x,
        y: y - 12,
        vx: 0,
        vy: -72,
        size: 20,
        text: `+${scoreValue}`,
        alpha: 1.0,
        maxLife: 0.72,
        color: '#21E6FF',
        coreColor: '#FFFFFF',
        drag: 1.1
      });
      this.totalSpawned++;
    }

    // 4. 径向青紫粉星尘能量扩散粒子
    for (let i = 0; i < burstCount; i++) {
      if (this.pool.activeCount >= this.maxActive) {
        break;
      }

      const angle = (Math.PI * 2 * i) / burstCount + randomRange(-0.16, 0.16);
      const speed = randomRange(75, 225);

      this.pool.acquire({
        type: 'dot',
        x: x + randomRange(-3, 3),
        y: y + randomRange(-3, 3),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomRange(2.5, 5.2),
        alpha: randomRange(0.88, 1.0),
        maxLife: randomRange(0.26, 0.52),
        color: randomChoice(CRYSTAL_BURST_COLORS),
        coreColor: '#FFFFFF',
        drag: 2.7,
        shrinkRatio: 0.1
      });
      this.totalSpawned++;
    }
  }

  /**
   * 更新所有活跃粒子，并将生命周期结束的粒子自动回收到 ObjectPool
   * @param {number} deltaTime 帧间隔（秒）
   */
  update(deltaTime) {
    this.pool.forEachActive((particle) => {
      const alive = particle.update(deltaTime);
      if (!alive) {
        if (this.pool.release(particle)) {
          this.totalRecycled++;
        }
      }
    });
  }

  /**
   * 绘制所有活跃粒子
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!ctx || this.pool.activeCount === 0) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 0;

    this.pool.forEachActive((particle) => {
      particle.render(ctx);
    });

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * 当前活跃粒子数量
   * @returns {number}
   */
  get activeParticleCount() {
    return this.pool.activeCount;
  }

  /**
   * 粒子池最大活跃上限
   * @returns {number}
   */
  get maxActiveParticles() {
    return this.maxActive;
  }

  /**
   * 清空并回收所有活跃粒子
   */
  clear() {
    this.pool.releaseAll();
    this._emitAccumulator = 0;
  }

  /**
   * 获取粒子系统对象池统计信息
   */
  getStats() {
    const poolStats = this.pool.getStats();
    return {
      ...poolStats,
      totalSpawned: this.totalSpawned,
      totalRecycled: this.totalRecycled
    };
  }
}
