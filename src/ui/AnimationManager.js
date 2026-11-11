/**
 * 《星际躲避者 (Star Dodger)》UI 过渡与主菜单战机全息展示动画管理器
 * 职责：
 * 1. 管理各界面面板（主菜单、操作说明、设置、暂停、结算）的平滑淡入淡出过渡动画
 * 2. 驱动主菜单右侧大型宇宙飞船全息机库展示画布（上下悬浮、推进器持续微光尾焰、能量核心呼吸闪烁与环绕粒子）
 * 3. 提供 HUD 数值跳动与按钮按压反馈微动画辅助
 */
import { lerp, randomRange } from '../utils/math.js';

export class AnimationManager {
  /**
   * @param {HTMLCanvasElement|null} menuShipCanvas 主菜单右侧大型战机展示画布
   */
  constructor(menuShipCanvas = null) {
    this.menuShipCanvas = menuShipCanvas;
    this.ctx = menuShipCanvas ? menuShipCanvas.getContext('2d') : null;

    this._time = 0;
    this._thrusterParticles = [];
    this._ambientOrbs = [];

    this._initShowcaseParticles();
  }

  /**
   * 初始化主菜单全息展示台的推进器微光粒子与环绕装饰星尘
   */
  _initShowcaseParticles() {
    this._thrusterParticles = [];
    for (let i = 0; i < 36; i++) {
      this._thrusterParticles.push(this._createThrusterParticle(true));
    }

    this._ambientOrbs = [];
    for (let i = 0; i < 22; i++) {
      this._ambientOrbs.push({
        angle: randomRange(0, Math.PI * 2),
        dist: randomRange(75, 165),
        speed: randomRange(0.25, 0.75) * (Math.random() > 0.5 ? 1 : -1),
        size: randomRange(1.2, 2.8),
        color: i % 3 === 0 ? '#FF3BA7' : i % 2 === 0 ? '#21E6FF' : '#895CFF',
        alphaOffset: randomRange(0, Math.PI * 2)
      });
    }
  }

  _createThrusterParticle(randomProgress = false) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const maxLife = randomRange(0.28, 0.58);
    return {
      side,
      xOffset: side * 28 + randomRange(-5, 5),
      yOffset: randomProgress ? randomRange(62, 145) : 62,
      vx: randomRange(-16, 16),
      vy: randomRange(130, 220),
      size: randomRange(2.4, 5.8),
      life: randomProgress ? randomRange(0.05, maxLife) : maxLife,
      maxLife,
      color: Math.random() > 0.32 ? '#21E6FF' : '#895CFF'
    };
  }

  /**
   * 平滑显示目标面板
   * @param {HTMLElement|null} el
   */
  showPanel(el) {
    if (!el) return;
    el.classList.remove('hidden', 'ui-panel-leaving');
    el.classList.add('ui-panel-entering');
    requestAnimationFrame(() => {
      if (!el.classList.contains('hidden')) {
        el.classList.remove('ui-panel-entering');
        el.classList.add('ui-panel-visible');
      }
    });
  }

  /**
   * 隐藏目标面板
   * @param {HTMLElement|null} el
   */
  hidePanel(el) {
    if (!el) return;
    el.classList.remove('ui-panel-entering', 'ui-panel-visible');
    el.classList.add('hidden');
  }

  /**
   * 为指定 DOM 元素触发一次短暂的高亮缩放脉冲
   * @param {HTMLElement|null} el
   */
  pulseElement(el) {
    if (!el) return;
    el.classList.remove('hud-value-pulse');
    // 触发重排以重新播放 CSS 动画
    void el.offsetWidth;
    el.classList.add('hud-value-pulse');
  }

  /**
   * 更新并渲染主菜单右侧的大型宇宙飞船动态展示（仅在 MENU 状态下调用）
   * @param {number} deltaTime 帧间隔（秒）
   */
  updateAndRenderMenuShowcase(deltaTime) {
    if (!this.menuShipCanvas || !this.ctx) return;

    this._time += deltaTime;
    const width = this.menuShipCanvas.width || 420;
    const height = this.menuShipCanvas.height || 380;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.48;

    // 飞船缓慢上下悬浮偏移与微幅横滚
    const floatY = Math.sin(this._time * 2.2) * 10;
    const floatRoll = Math.sin(this._time * 1.3) * 0.045;
    const corePulse = (Math.sin(this._time * 5.2) + 1) * 0.5;

    // 1. 绘制全息机库能量底座与扫描圆环
    this._renderHologramBase(ctx, cx, cy, corePulse);

    // 2. 绘制菜单专属环绕微光粒子
    this._renderAmbientOrbs(ctx, cx, cy);

    // 3. 更新并绘制双推进器持续微光粒子尾焰
    this._updateAndRenderThrusterParticles(ctx, deltaTime, cx, cy + floatY);

    // 4. 绘制放大版（2.15倍）高精度俯视角科幻战机
    ctx.save();
    ctx.translate(cx, cy + floatY);
    ctx.rotate(floatRoll);
    ctx.scale(2.15, 2.15);

    this._renderLargeSpaceship(ctx, corePulse);

    ctx.restore();
  }

  /**
   * 绘制全息底座圆环与雷达刻度
   */
  _renderHologramBase(ctx, cx, cy, corePulse) {
    ctx.save();

    // 背部深空青紫径向光晕
    const bgGlow = ctx.createRadialGradient(cx, cy, 12, cx, cy, 175);
    bgGlow.addColorStop(0, `rgba(33, 230, 255, ${(0.18 + corePulse * 0.08).toFixed(3)})`);
    bgGlow.addColorStop(0.55, 'rgba(137, 92, 255, 0.10)');
    bgGlow.addColorStop(1, 'rgba(8, 13, 33, 0)');
    ctx.fillStyle = bgGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, 175, 0, Math.PI * 2);
    ctx.fill();

    // 外圈旋转虚线全息环
    ctx.strokeStyle = 'rgba(33, 230, 255, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this._time * 0.35);
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 142, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 内圈反向旋转紫色能量环
    ctx.strokeStyle = 'rgba(137, 92, 255, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this._time * 0.55);
    ctx.setLineDash([8, 14]);
    ctx.beginPath();
    ctx.arc(0, 0, 112, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  /**
   * 绘制环绕飞船的菜单专属装饰微光粒子
   */
  _renderAmbientOrbs(ctx, cx, cy) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this._ambientOrbs.length; i++) {
      const orb = this._ambientOrbs[i];
      const angle = orb.angle + this._time * orb.speed;
      const x = cx + Math.cos(angle) * orb.dist;
      const y = cy + Math.sin(angle) * (orb.dist * 0.72);
      const alpha = 0.35 + 0.55 * ((Math.sin(this._time * 3 + orb.alphaOffset) + 1) * 0.5);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = orb.color;
      ctx.beginPath();
      ctx.arc(x, y, orb.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 更新并绘制飞船尾部双推进器的持续微光尾焰粒子
   */
  _updateAndRenderThrusterParticles(ctx, deltaTime, shipX, shipY) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this._thrusterParticles.length; i++) {
      const p = this._thrusterParticles[i];
      p.life -= deltaTime;
      if (p.life <= 0) {
        this._thrusterParticles[i] = this._createThrusterParticle(false);
        continue;
      }

      p.xOffset += p.vx * deltaTime;
      p.yOffset += p.vy * deltaTime;

      const lifeRatio = Math.max(0, p.life / p.maxLife);
      const px = shipX + p.xOffset;
      const py = shipY + p.yOffset;
      const radius = p.size * (0.4 + lifeRatio * 0.7);

      ctx.globalAlpha = lifeRatio * 0.82;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 绘制主菜单右侧大型宇宙战机本体（带推进器微光火舌与周期性闪烁能量核心）
   */
  _renderLargeSpaceship(ctx, pulse) {
    const ox = 13;
    const oy = 26;
    const flameLen = lerp(18, 28, pulse);

    // 1. 双推进器喷口持续发光等离子火舌
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sign of [-1, 1]) {
      const nx = sign * ox;
      const flameGrad = ctx.createLinearGradient(nx, oy, nx, oy + flameLen);
      flameGrad.addColorStop(0, '#FFFFFF');
      flameGrad.addColorStop(0.35, '#21E6FF');
      flameGrad.addColorStop(0.75, 'rgba(137, 92, 255, 0.65)');
      flameGrad.addColorStop(1, 'rgba(255, 59, 167, 0)');

      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(nx - 5, oy + 2);
      ctx.quadraticCurveTo(nx, oy + flameLen * 1.25, nx + 5, oy + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 2. 推进器喷管金属底座
    ctx.fillStyle = '#081534';
    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.4;
    for (const sign of [-1, 1]) {
      const nx = sign * ox;
      ctx.beginPath();
      ctx.moveTo(nx - 5.5, oy - 6);
      ctx.lineTo(nx + 5.5, oy - 6);
      ctx.lineTo(nx + 4.2, oy + 4);
      ctx.lineTo(nx - 4.2, oy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 3. 左右对称双层主翼（霓虹青发光轮廓）
    ctx.save();
    ctx.shadowColor = '#21E6FF';
    ctx.shadowBlur = 14;

    const wingGrad = ctx.createLinearGradient(0, -26, 0, 28);
    wingGrad.addColorStop(0, '#102E68');
    wingGrad.addColorStop(0.55, '#0A1D45');
    wingGrad.addColorStop(1, '#06102A');

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(12, -10);
    ctx.lineTo(33, 8);
    ctx.lineTo(31, 22);
    ctx.lineTo(19, 18);
    ctx.lineTo(16, 26);
    ctx.lineTo(0, 21);
    ctx.lineTo(-16, 26);
    ctx.lineTo(-19, 18);
    ctx.lineTo(-31, 22);
    ctx.lineTo(-33, 8);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(33, 230, 255, 0.58)';
    ctx.lineWidth = 1.1;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 10, -4);
      ctx.lineTo(sign * 27, 10);
      ctx.lineTo(sign * 25, 17);
      ctx.stroke();
    }
    ctx.restore();

    // 4. 中央主脊柱装甲
    const hullGrad = ctx.createLinearGradient(0, -36, 0, 28);
    hullGrad.addColorStop(0, '#1C52A8');
    hullGrad.addColorStop(0.5, '#0E285E');
    hullGrad.addColorStop(1, '#071433');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.lineTo(9, -14);
    ctx.lineTo(11, 14);
    ctx.lineTo(6, 27);
    ctx.lineTo(0, 23);
    ctx.lineTo(-6, 27);
    ctx.lineTo(-11, 14);
    ctx.lineTo(-9, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. 中央流线驾驶舱盖
    const canopyGrad = ctx.createLinearGradient(0, -23, 0, 5);
    canopyGrad.addColorStop(0, '#E8F7FF');
    canopyGrad.addColorStop(0.4, '#21E6FF');
    canopyGrad.addColorStop(1, '#0051B8');

    ctx.fillStyle = canopyGrad;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(5.2, -9);
    ctx.lineTo(3.6, 3);
    ctx.lineTo(0, 6);
    ctx.lineTo(-3.6, 3);
    ctx.lineTo(-5.2, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6. 周期性呼吸闪烁的紫粉高能反应堆核心
    const coreY = 13;
    const coreRadius = 4.8 + pulse * 1.8;
    const coreGrad = ctx.createRadialGradient(0, coreY, 0.6, 0, coreY, coreRadius * 2.2);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.35, '#FF3BA7');
    coreGrad.addColorStop(0.72, '#895CFF');
    coreGrad.addColorStop(1, 'rgba(137, 92, 255, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, coreY, coreRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF3BA7';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, coreY - 4.4);
    ctx.lineTo(3.8, coreY);
    ctx.lineTo(0, coreY + 4.4);
    ctx.lineTo(-3.8, coreY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 翼尖霓虹粉航行灯
    ctx.fillStyle = '#FF3BA7';
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sign * 31.5, 11, 1.9 + pulse * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
