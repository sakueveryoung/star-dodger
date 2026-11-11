/**
 * 《星际躲避者 (Star Dodger)》单个粒子实体模块 (Phase 6 视觉增强版)
 * 支持类型：
 * - 'dot': 推进器尾焰与能量星尘圆点
 * - 'shard': 陨石碰撞定向飞溅的多边形岩石碎片
 * - 'ring': 能量冲击扩散光环
 * - 'text': 高对比度上浮得分文字 (+10)
 */
import { clamp, lerp } from '../utils/math.js';

export class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.initialSize = 3;
    this.size = 3;
    this.initialAlpha = 1;
    this.alpha = 1;
    this.age = 0;
    this.maxLife = 0.25;
    this.color = '#21E6FF';
    this.coreColor = '#EDF8FF';
    this.drag = 1.5;
    this.shrinkRatio = 0.15;
    this.type = 'dot';      // 'dot' | 'shard' | 'ring' | 'text'
    this.maxRadius = 48;
    this.text = '';
    this.rotation = 0;
    this.rotationSpeed = 0;
  }

  /**
   * 初始化或重置粒子状态（由 ObjectPool.acquire 调用）
   * @param {Object} options 粒子配置参数
   */
  reset(options = {}) {
    this.active = true;
    this.type = options.type ?? 'dot';
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? 120;
    this.initialSize = options.size ?? 3.5;
    this.size = this.initialSize;
    this.maxRadius = options.maxRadius ?? 48;
    this.text = options.text ?? '';
    this.initialAlpha = options.alpha ?? 0.9;
    this.alpha = this.initialAlpha;
    this.age = 0;
    this.maxLife = Math.max(0.05, options.maxLife ?? 0.25);
    this.color = options.color ?? '#21E6FF';
    this.coreColor = options.coreColor ?? '#EDF8FF';
    this.drag = options.drag ?? 1.8;
    this.shrinkRatio = options.shrinkRatio ?? 0.12;
    this.rotation = options.rotation ?? 0;
    this.rotationSpeed = options.rotationSpeed ?? 0;
  }

  /**
   * 回收钩子（由 ObjectPool.release 调用）
   */
  onRelease() {
    this.active = false;
    this.alpha = 0;
  }

  /**
   * 更新粒子位置、尺寸、旋转与透明度
   * @param {number} deltaTime 帧间隔（秒）
   * @returns {boolean} 粒子是否仍然存活
   */
  update(deltaTime) {
    if (!this.active) {
      return false;
    }

    this.age += deltaTime;
    if (this.age >= this.maxLife) {
      this.alpha = 0;
      return false;
    }

    const damping = Math.max(0, 1 - this.drag * deltaTime);
    this.vx *= damping;
    this.vy *= damping;

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;

    const progress = clamp(this.age / this.maxLife, 0, 1);

    if (this.type === 'ring') {
      this.size = lerp(this.initialSize, this.maxRadius, 1 - Math.pow(1 - progress, 2));
      this.alpha = clamp(this.initialAlpha * (1 - progress), 0, 1);
    } else if (this.type === 'text') {
      this.alpha = progress < 0.45 ? this.initialAlpha : clamp(this.initialAlpha * (1 - (progress - 0.45) / 0.55), 0, 1);
    } else {
      this.size = Math.max(0.3, lerp(this.initialSize, this.initialSize * this.shrinkRatio, progress));
      this.alpha = clamp(this.initialAlpha * (1 - progress * progress), 0, 1);
    }

    return this.alpha > 0.01;
  }

  /**
   * 绘制单个粒子
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.active || this.alpha <= 0.01 || this.size <= 0.2) {
      return;
    }

    if (this.type === 'ring') {
      ctx.globalAlpha = this.alpha;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }

    if (this.type === 'text') {
      ctx.globalAlpha = this.alpha;
      ctx.font = `900 ${Math.round(this.initialSize)}px Orbitron, Consolas, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(8, 13, 33, 0.9)';
      ctx.lineWidth = 3.2;
      ctx.strokeText(this.text, this.x, this.y);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, this.x, this.y);
      ctx.fillStyle = this.coreColor;
      ctx.fillText(this.text, this.x - 0.8, this.y - 0.8);
      return;
    }

    if (this.type === 'shard') {
      // 绘制带自转的棱角岩石碎片
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.coreColor;
      ctx.lineWidth = 0.9;
      const s = this.size;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.25);
      ctx.lineTo(s * 0.95, -s * 0.2);
      ctx.lineTo(s * 0.55, s * 1.1);
      ctx.lineTo(-s * 0.85, s * 0.75);
      ctx.lineTo(-s, -s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 普通能量圆点粒子
    ctx.globalAlpha = this.alpha * 0.65;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 1.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.coreColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
}
