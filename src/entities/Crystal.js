/**
 * 《星际躲避者 (Star Dodger)》独立能量晶体实体模块 (Phase 6 视觉增强版)
 * 职责：
 * 1. 支持 ObjectPool 池化复用（reset / onRelease）
 * 2. 绘制多层棱镜切面菱形主体、外围霓虹青发光轮廓、高亮度紫粉色核心星芒与环绕漂浮微粒
 * 3. 基于 deltaTime 实现缓慢下落、轻微左右漂移与柔和谐波旋转，离开屏幕或被收集后自动回收
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { randomRange, clamp } from '../utils/math.js';

export class Crystal {
  constructor() {
    this.active = false;
    this.isCollected = false;

    this.x = 0;
    this.y = 0;
    this.vy = 130;
    this.radius = GAME_CONFIG.CRYSTAL.RADIUS || 18;
    this.scoreValue = GAME_CONFIG.CRYSTAL.SCORE_VALUE || 10;

    // 左右轻微漂移参数
    this._swayPhase = 0;
    this._swayFrequency = 2.0;
    this._swaySpeed = 28;

    // 旋转与周期性呼吸参数
    this.rotation = 0;
    this.rotationSpeed = 1.1;
    this._pulsePhase = 0;
    this._pulseSpeed = GAME_CONFIG.CRYSTAL.PULSE_SPEED || 5.0;

    // 环绕晶体的少量漂浮微粒本地相位
    this._orbitAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  }

  /**
   * 初始化或重置能量晶体状态（由 ObjectPool.acquire 调用）
   * @param {Object} [options] 初始化参数
   */
  reset(options = {}) {
    const cfg = GAME_CONFIG.CRYSTAL;

    this.active = true;
    this.isCollected = false;

    this.radius = options.radius ?? cfg.RADIUS ?? 18;
    this.scoreValue = options.scoreValue ?? cfg.SCORE_VALUE ?? 10;
    this.x = options.x ?? 0;
    this.y = options.y ?? -(this.radius + 18);

    this.vy = options.vy ?? randomRange(cfg.SPEED_MIN, cfg.SPEED_MAX);

    this._swayPhase = randomRange(0, Math.PI * 2);
    this._swayFrequency = randomRange(cfg.SWAY_FREQUENCY_MIN, cfg.SWAY_FREQUENCY_MAX);
    this._swaySpeed = randomRange(cfg.SWAY_AMPLITUDE_MIN, cfg.SWAY_AMPLITUDE_MAX);

    const rotDir = Math.random() < 0.5 ? -1 : 1;
    this.rotation = randomRange(0, Math.PI * 2);
    this.rotationSpeed =
      options.rotationSpeed ??
      rotDir * randomRange(cfg.ROTATION_SPEED_MIN, cfg.ROTATION_SPEED_MAX);

    this._pulsePhase = randomRange(0, Math.PI * 2);
    this._pulseSpeed = cfg.PULSE_SPEED || 5.0;

    for (let i = 0; i < this._orbitAngles.length; i++) {
      this._orbitAngles[i] = (i * Math.PI * 2) / this._orbitAngles.length + randomRange(-0.2, 0.2);
    }
  }

  /**
   * 回收清理钩子（由 ObjectPool.release 调用）
   */
  onRelease() {
    this.active = false;
    this.isCollected = false;
    this.vy = 0;
  }

  /**
   * 基于 deltaTime 更新晶体缓慢下落、左右轻微漂移、谐波旋转与呼吸相位
   * @param {number} deltaTime 帧间隔（秒）
   * @param {number} viewportWidth 当前视口宽度
   * @param {number} viewportHeight 当前视口高度
   * @returns {boolean} 是否仍在屏幕有效范围内
   */
  update(deltaTime, viewportWidth, viewportHeight) {
    if (!this.active) {
      return false;
    }

    this._swayPhase += this._swayFrequency * deltaTime;
    this._pulsePhase += this._pulseSpeed * deltaTime;
    // 在匀速自转基础上叠加微幅正弦角速度调制，使晶体旋转更具灵动感
    const harmonicBoost = 1 + 0.22 * Math.sin(this._pulsePhase * 0.5);
    this.rotation += this.rotationSpeed * harmonicBoost * deltaTime;

    const vx = Math.cos(this._swayPhase) * this._swaySpeed;
    this.x = clamp(this.x + vx * deltaTime, this.radius + 20, viewportWidth - this.radius - 20);
    this.y += this.vy * deltaTime;

    for (let i = 0; i < this._orbitAngles.length; i++) {
      this._orbitAngles[i] += (1.9 + i * 0.45) * deltaTime;
    }

    if (this.y - this.radius - 36 > viewportHeight) {
      return false;
    }

    return true;
  }

  /**
   * 绘制高辨识度能量晶体（外围脉冲光环 + 双层八面体棱镜切面 + 高亮度核心十字星芒）
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.active) {
      return;
    }

    const pulse = (Math.sin(this._pulsePhase) + 1) * 0.5;
    const scale = 0.93 + pulse * 0.15;
    const r = this.radius;

    ctx.save();
    ctx.translate(this.x, this.y);

    // 1. 绘制周期性呼吸的外围能量光晕
    const haloRadius = r * (1.65 + pulse * 0.35);
    const haloGrad = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, haloRadius);
    haloGrad.addColorStop(0, 'rgba(255, 59, 167, 0.45)');
    haloGrad.addColorStop(0.45, 'rgba(137, 92, 255, 0.26)');
    haloGrad.addColorStop(0.78, 'rgba(33, 230, 255, 0.16)');
    haloGrad.addColorStop(1, 'rgba(33, 230, 255, 0)');

    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. 绘制环绕漂浮粒子
    for (let i = 0; i < this._orbitAngles.length; i++) {
      const ang = this._orbitAngles[i];
      const orbitR = r * (1.18 + Math.sin(this._pulsePhase + i * 1.7) * 0.2);
      const px = Math.cos(ang) * orbitR;
      const py = Math.sin(ang) * orbitR;

      ctx.fillStyle = i % 2 === 0 ? '#21E6FF' : '#FF3BA7';
      ctx.globalAlpha = 0.6 + pulse * 0.38;
      ctx.beginPath();
      ctx.arc(px, py, 1.9 + (i % 2) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 3. 旋转并缩放菱形晶体主体
    ctx.rotate(this.rotation);
    ctx.scale(scale, scale);

    const diamondH = r * 1.18;
    const diamondW = r * 0.84;

    ctx.shadowColor = '#21E6FF';
    ctx.shadowBlur = 12;

    const bodyGrad = ctx.createLinearGradient(-diamondW, -diamondH, diamondW, diamondH);
    bodyGrad.addColorStop(0, 'rgba(33, 230, 255, 0.92)');
    bodyGrad.addColorStop(0.5, 'rgba(24, 52, 128, 0.9)');
    bodyGrad.addColorStop(1, 'rgba(137, 92, 255, 0.92)');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#EDF8FF';
    ctx.lineWidth = 2.1;

    ctx.beginPath();
    ctx.moveTo(0, -diamondH);
    ctx.lineTo(diamondW, 0);
    ctx.lineTo(0, diamondH);
    ctx.lineTo(-diamondW, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 关闭外阴影，绘制左半受光亮面与内部棱镜切面折线
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.beginPath();
    ctx.moveTo(0, -diamondH);
    ctx.lineTo(0, 0);
    ctx.lineTo(-diamondW, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(237, 248, 255, 0.58)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(0, -diamondH);
    ctx.lineTo(0, diamondH);
    ctx.moveTo(-diamondW, 0);
    ctx.lineTo(diamondW, 0);
    // 内层八边形折射边缘
    ctx.moveTo(0, -diamondH * 0.65);
    ctx.lineTo(diamondW * 0.65, 0);
    ctx.lineTo(0, diamondH * 0.65);
    ctx.lineTo(-diamondW * 0.65, 0);
    ctx.closePath();
    ctx.stroke();

    // 4. 中心高亮度紫粉色能量核心与十字高光星芒
    const coreH = diamondH * 0.52;
    const coreW = diamondW * 0.52;
    const coreGrad = ctx.createRadialGradient(0, 0, 0.8, 0, 0, coreH);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.45, '#FF3BA7');
    coreGrad.addColorStop(1, '#895CFF');

    ctx.fillStyle = coreGrad;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -coreH);
    ctx.lineTo(coreW, 0);
    ctx.lineTo(0, coreH);
    ctx.lineTo(-coreW, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 核心白炽十字星芒
    const flareLen = r * (0.42 + pulse * 0.22);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-flareLen, 0);
    ctx.lineTo(flareLen, 0);
    ctx.moveTo(0, -flareLen);
    ctx.lineTo(0, flareLen);
    ctx.stroke();

    ctx.restore();
  }
}
