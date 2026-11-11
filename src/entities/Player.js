/**
 * 《星际躲避者 (Star Dodger)》玩家宇宙飞船实体模块
 * 职责：管理玩家飞船的位置、8方向归一化平滑移动、动态视口边界限制以及俯视角科幻霓虹战机 Canvas 2D 绘制
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { clamp, lerp } from '../utils/math.js';

export class Player {
  /**
   * @param {number} viewportWidth 当前画布逻辑宽度
   * @param {number} viewportHeight 当前画布逻辑高度
   */
  constructor(viewportWidth, viewportHeight) {
    const cfg = GAME_CONFIG.PLAYER;

    this.viewportWidth = Math.max(320, viewportWidth);
    this.viewportHeight = Math.max(240, viewportHeight);

    // 尺寸与碰撞属性
    this.width = cfg.WIDTH || 68;
    this.height = cfg.HEIGHT || 74;
    this.halfWidth = this.width * 0.5;
    this.halfHeight = this.height * 0.5;
    this.radius = cfg.RADIUS || 26;
    this.boundaryPadding = cfg.BOUNDARY_PADDING || 14;

    // 运动物理参数
    this.speed = cfg.SPEED || 450;
    this.acceleration = cfg.ACCELERATION || 26;

    // 推进器喷口相对偏移
    this.thrusterOffsetX = cfg.THRUSTER_OFFSET_X || 13;
    this.thrusterOffsetY = cfg.THRUSTER_OFFSET_Y || 30;

    // 动态计算的移动安全边界
    this.bounds = {
      minX: 0,
      maxX: this.viewportWidth,
      minY: 0,
      maxY: this.viewportHeight
    };
    this._recalculateBounds();

    // 初始位置设置在画面中央偏下区域
    this.x = this.viewportWidth * (cfg.SPAWN_X_RATIO ?? 0.5);
    this.y = this.viewportHeight * (cfg.SPAWN_Y_RATIO ?? 0.78);
    this._clampToBounds();

    // 当前速度分量（逻辑像素/秒）
    this.vx = 0;
    this.vy = 0;

    // 状态与视觉反馈参数
    this.isMoving = false;
    this.bankAngle = 0;       // 左右横滚倾斜视觉系数 [-1, 1]
    this.thrustIntensity = 0; // 推进器视觉输出强度 [0, 1]
    this._pulseTime = 0;      // 核心能量呼吸计时器

    // 受击与无敌视觉反馈状态（Phase 4 扩展）
    this.blinkInterval = cfg.BLINK_INTERVAL || 0.08;
    this.invincibleTimer = 0; // 剩余无敌闪烁时间（秒）
    this.hitFlashTimer = 0;   // 受击瞬间强光脉冲护盾计时（秒）
  }

  /**
   * 当前是否处于受击后无敌状态
   * @returns {boolean}
   */
  get isInvincible() {
    return this.invincibleTimer > 0;
  }

  /**
   * 触发玩家受击视觉反馈（开启无敌闪烁与护盾能量冲击环）
   * @param {number} [invincibleDuration=1.2] 无敌持续时间（秒）
   */
  triggerHitFeedback(invincibleDuration = GAME_CONFIG.PLAYER.INVINCIBLE_DURATION || 1.2) {
    this.invincibleTimer = Math.max(this.invincibleTimer, invincibleDuration);
    this.hitFlashTimer = 0.45;
  }

  /**
   * 根据当前视口尺寸重新计算飞船可移动边界（确保机翼与机身绝不超出画面）
   */
  _recalculateBounds() {
    const marginX = this.halfWidth + this.boundaryPadding;
    const marginY = this.halfHeight + this.boundaryPadding;

    this.bounds.minX = Math.min(marginX, this.viewportWidth * 0.5);
    this.bounds.maxX = Math.max(this.viewportWidth - marginX, this.viewportWidth * 0.5);
    this.bounds.minY = Math.min(marginY, this.viewportHeight * 0.5);
    this.bounds.maxY = Math.max(this.viewportHeight - marginY, this.viewportHeight * 0.5);
  }

  /**
   * 将飞船坐标限制在当前可移动边界内
   */
  _clampToBounds() {
    this.x = clamp(this.x, this.bounds.minX, this.bounds.maxX);
    this.y = clamp(this.y, this.bounds.minY, this.bounds.maxY);
  }

  /**
   * 重置飞船到画面中央偏下初始位置
   */
  resetPosition() {
    const cfg = GAME_CONFIG.PLAYER;
    this.x = this.viewportWidth * (cfg.SPAWN_X_RATIO ?? 0.5);
    this.y = this.viewportHeight * (cfg.SPAWN_Y_RATIO ?? 0.78);
    this.vx = 0;
    this.vy = 0;
    this.isMoving = false;
    this.bankAngle = 0;
    this.thrustIntensity = 0;
    this.invincibleTimer = 0;
    this.hitFlashTimer = 0;
    this._clampToBounds();
  }

  /**
   * 响应浏览器窗口缩放，更新可移动范围并按比例修正飞船位置
   * @param {number} newWidth 新视口逻辑宽度
   * @param {number} newHeight 新视口逻辑高度
   */
  resize(newWidth, newHeight) {
    const validW = Math.max(320, newWidth);
    const validH = Math.max(240, newHeight);

    const ratioX = validW / this.viewportWidth;
    const ratioY = validH / this.viewportHeight;

    this.viewportWidth = validW;
    this.viewportHeight = validH;

    this._recalculateBounds();

    // 按比例映射坐标并严格钳制在新边界内
    this.x *= ratioX;
    this.y *= ratioY;
    this._clampToBounds();
  }

  /**
   * 更新玩家飞船移动、边界限制与视觉反馈参数
   * @param {number} deltaTime 帧间隔（秒）
   * @param {import('../core/InputManager.js').InputManager} input 输入管理器实例
   */
  update(deltaTime, input) {
    this._pulseTime += deltaTime;

    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - deltaTime);
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaTime);
    }

    // 从现有 InputManager 获取归一化后的方向向量 (模长为 0 或 1)
    const moveVec = input ? input.getMovementVector() : { x: 0, y: 0, length: 0 };

    if (moveVec.length > 0) {
      this.isMoving = true;
      const targetVx = moveVec.x * this.speed;
      const targetVy = moveVec.y * this.speed;

      // 使用指数平滑插值实现柔和起步与转向手感，同时保持斜向与轴向加速度比例严格一致
      const smoothFactor = 1 - Math.exp(-this.acceleration * deltaTime);
      this.vx = lerp(this.vx, targetVx, smoothFactor);
      this.vy = lerp(this.vy, targetVy, smoothFactor);

      // 接近目标速度时直接对齐，保证匀速阶段速度精确等于 this.speed
      if (Math.hypot(targetVx - this.vx, targetVy - this.vy) < 1.5) {
        this.vx = targetVx;
        this.vy = targetVy;
      }
    } else {
      // 玩家停止按键后，飞船立即停止移动，避免惯性滑行导致误撞
      this.vx = 0;
      this.vy = 0;
      this.isMoving = false;
    }

    // 使用 deltaTime 计算位移增量
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // 严格执行边界限制，若触碰边界则将该方向速度分量归零
    if (this.x <= this.bounds.minX) {
      this.x = this.bounds.minX;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x >= this.bounds.maxX) {
      this.x = this.bounds.maxX;
      if (this.vx > 0) this.vx = 0;
    }

    if (this.y <= this.bounds.minY) {
      this.y = this.bounds.minY;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y >= this.bounds.maxY) {
      this.y = this.bounds.maxY;
      if (this.vy > 0) this.vy = 0;
    }

    // 更新移动视觉反馈：横向侧倾系数与推进器能量强度平滑过渡
    const targetBank = clamp(this.vx / this.speed, -1, 1);
    const visualSmooth = 1 - Math.exp(-14 * deltaTime);
    this.bankAngle = lerp(this.bankAngle, targetBank, visualSmooth);

    const targetThrust = this.isMoving ? 1.0 : 0.0;
    this.thrustIntensity = lerp(this.thrustIntensity, targetThrust, visualSmooth);
  }

  /**
   * 获取当前移动速度模长（逻辑像素/秒）
   * @returns {number}
   */
  getCurrentSpeed() {
    return Math.hypot(this.vx, this.vy);
  }

  /**
   * 获取当前速度占最大速度的比例 [0, 1]
   * @returns {number}
   */
  getSpeedRatio() {
    return clamp(this.getCurrentSpeed() / this.speed, 0, 1);
  }

  /**
   * 获取尾部左右两个推进器喷口的世界坐标（供 ParticleSystem 发射尾焰使用）
   * @returns {Array<{x: number, y: number}>}
   */
  getThrusterPositions() {
    const wingScaleX = 1 - Math.abs(this.bankAngle) * 0.14;
    const offsetX = this.thrusterOffsetX * wingScaleX;
    const offsetY = this.thrusterOffsetY;

    return [
      { x: this.x - offsetX, y: this.y + offsetY },
      { x: this.x + offsetX, y: this.y + offsetY }
    ];
  }

  /**
   * 使用 Canvas 2D 绘制俯视角科幻霓虹宇宙飞船（含受击护盾与无敌闪烁反馈）
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!ctx) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // 若处于受击无敌状态，先在飞船外围绘制青紫/洋红能量护盾光环
    if (this.invincibleTimer > 0 || this.hitFlashTimer > 0) {
      this._renderHitShieldAura(ctx);
    }

    // 移动时产生轻微机头偏转与机翼横滚透视缩放，增强操控反馈
    const tiltRotate = this.bankAngle * 0.08;
    const wingScaleX = 1 - Math.abs(this.bankAngle) * 0.14;
    ctx.rotate(tiltRotate);
    ctx.scale(wingScaleX, 1);

    // 无敌期间飞船本体高频闪烁（交替在 1.0 与 0.28 透明度之间切换，结束后自动恢复 1.0）
    if (this.invincibleTimer > 0) {
      const isBlinkDim = Math.floor(this.invincibleTimer / this.blinkInterval) % 2 === 1;
      ctx.globalAlpha = isBlinkDim ? 0.28 : 0.96;
    } else {
      ctx.globalAlpha = 1.0;
    }

    const pulse = (Math.sin(this._pulseTime * 6) + 1) * 0.5;

    // 1. 绘制尾部双推进器实时能量喷口光舌
    this._renderThrusterNozzles(ctx, pulse);

    // 2. 绘制对称双层主翼与前掠外翼（深空蓝装甲 + 霓虹青发光轮廓）
    this._renderWings(ctx);

    // 3. 绘制中央机身主脊柱装甲
    this._renderFuselage(ctx);

    // 4. 绘制中央流线型驾驶舱（电光蓝渐变玻璃舱盖）
    this._renderCockpit(ctx);

    // 5. 绘制紫色/粉色高能反应堆核心与翼尖粉色点缀灯
    this._renderEnergyCoreAndAccents(ctx, pulse);

    ctx.restore();
  }

  /**
   * 绘制受击瞬间冲击环与无敌期间的六边形蜂巢霓虹能量护盾反馈
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderHitShieldAura(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const shieldRadius = this.radius + 15;
    const invRatio = clamp(this.invincibleTimer / (GAME_CONFIG.PLAYER.INVINCIBLE_DURATION || 1.2), 0, 1);
    const wavePulse = 0.68 + 0.32 * Math.sin(this._pulseTime * 22);

    // 1. 外层径向护盾能量场
    const auraGrad = ctx.createRadialGradient(0, 0, shieldRadius * 0.3, 0, 0, shieldRadius + 8);
    auraGrad.addColorStop(0, 'rgba(33, 230, 255, 0)');
    auraGrad.addColorStop(0.62, `rgba(137, 92, 255, ${(0.24 * invRatio * wavePulse).toFixed(3)})`);
    auraGrad.addColorStop(0.88, `rgba(33, 230, 255, ${(0.52 * invRatio * wavePulse).toFixed(3)})`);
    auraGrad.addColorStop(1, 'rgba(255, 59, 167, 0)');

    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, shieldRadius + 8, 0, Math.PI * 2);
    ctx.fill();

    // 2. 六边形战术力场几何护盾折线
    const hexRadius = shieldRadius - 2;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = `rgba(33, 230, 255, ${(0.45 * invRatio).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - this._pulseTime * 1.8;
      const hx = Math.cos(ang) * hexRadius;
      const hy = Math.sin(ang) * hexRadius;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();

    // 3. 旋转三段高能护盾电弧环
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = this.hitFlashTimer > 0 ? '#FF3BA7' : '#21E6FF';
    const rot = this._pulseTime * 5.8;
    for (let i = 0; i < 3; i++) {
      const startAngle = rot + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, shieldRadius, startAngle, startAngle + Math.PI * 0.42);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制尾部左右两个推进器舱体与双层等离子能量火舌
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} pulse 呼吸系数 [0, 1]
   */
  _renderThrusterNozzles(ctx, pulse) {
    const ox = this.thrusterOffsetX;
    const oy = this.thrusterOffsetY - 4;
    const flameLen = lerp(12, 26, this.thrustIntensity) + pulse * 5;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const sign of [-1, 1]) {
      const nx = sign * ox;

      // 外层青紫等离子扩散光舌
      const flameGrad = ctx.createLinearGradient(nx, oy, nx, oy + flameLen);
      flameGrad.addColorStop(0, '#FFFFFF');
      flameGrad.addColorStop(0.32, '#21E6FF');
      flameGrad.addColorStop(0.72, 'rgba(137, 92, 255, 0.62)');
      flameGrad.addColorStop(1, 'rgba(255, 59, 167, 0)');

      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(nx - 4.8, oy + 2);
      ctx.quadraticCurveTo(nx, oy + flameLen * 1.22, nx + 4.8, oy + 2);
      ctx.closePath();
      ctx.fill();

      // 内层白炽高速喷流核心
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.moveTo(nx - 2.1, oy + 2);
      ctx.quadraticCurveTo(nx, oy + flameLen * 0.62, nx + 2.1, oy + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 推进器金属喷管底座与散热环
    ctx.fillStyle = '#06112B';
    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.4;
    for (const sign of [-1, 1]) {
      const nx = sign * ox;
      ctx.beginPath();
      ctx.moveTo(nx - 5.6, oy - 6);
      ctx.lineTo(nx + 5.6, oy - 6);
      ctx.lineTo(nx + 4.2, oy + 4);
      ctx.lineTo(nx - 4.2, oy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * 绘制左右对称科幻机翼（增加前缘高光、明暗切面、进气格栅与外轮廓对比度保护）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderWings(ctx) {
    ctx.save();

    // 底层深色描边衬底，确保飞船在穿过高亮度星云时依然边缘锐利清晰
    ctx.strokeStyle = 'rgba(4, 7, 20, 0.9)';
    ctx.lineWidth = 4.6;

    // 仅在主机翼外轮廓开启一次适度 shadowBlur，突出飞船主体视觉
    ctx.shadowColor = '#21E6FF';
    ctx.shadowBlur = 12;

    const wingGrad = ctx.createLinearGradient(-32, -24, 32, 28);
    wingGrad.addColorStop(0, '#163B82');
    wingGrad.addColorStop(0.48, '#0C2252');
    wingGrad.addColorStop(1, '#05102B');

    ctx.fillStyle = wingGrad;

    // 对称主翼多边形路径
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
    ctx.stroke();
    ctx.fill();

    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // 关闭阴影绘制机翼明暗切面、进气口与导流能量槽
    ctx.shadowBlur = 0;

    // 左侧受光高光折面 vs 右侧深色背光折面，强化机身明暗立体感
    ctx.fillStyle = 'rgba(33, 230, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(-11, -9);
    ctx.lineTo(-31, 8);
    ctx.lineTo(-26, 14);
    ctx.lineTo(-10, -2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(3, 6, 18, 0.36)';
    ctx.beginPath();
    ctx.moveTo(11, -9);
    ctx.lineTo(31, 8);
    ctx.lineTo(26, 14);
    ctx.lineTo(10, -2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(33, 230, 255, 0.62)';
    ctx.lineWidth = 1.2;

    for (const sign of [-1, 1]) {
      // 机翼能量导流折线
      ctx.beginPath();
      ctx.moveTo(sign * 10, -4);
      ctx.lineTo(sign * 27, 10);
      ctx.lineTo(sign * 25, 17);
      ctx.stroke();

      // 副翼能量条填充
      ctx.fillStyle = 'rgba(33, 230, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(sign * 13, 2);
      ctx.lineTo(sign * 26, 12);
      ctx.lineTo(sign * 20, 15);
      ctx.lineTo(sign * 11, 8);
      ctx.closePath();
      ctx.fill();

      // 翼尖外挂稳定鳍高亮边
      ctx.strokeStyle = 'rgba(137, 92, 255, 0.75)';
      ctx.beginPath();
      ctx.moveTo(sign * 32.5, 7);
      ctx.lineTo(sign * 30.5, 22);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(33, 230, 255, 0.62)';
    }

    ctx.restore();
  }

  /**
   * 绘制中央机身主装甲脊柱（含左右明暗立体装甲斜面）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderFuselage(ctx) {
    const hullGrad = ctx.createLinearGradient(-11, -36, 11, 28);
    hullGrad.addColorStop(0, '#235EC0');
    hullGrad.addColorStop(0.48, '#102D68');
    hullGrad.addColorStop(1, '#06122E');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#21E6FF';
    ctx.lineWidth = 1.7;

    ctx.beginPath();
    ctx.moveTo(0, -36);      // 锐利机鼻顶端
    ctx.lineTo(9, -14);      // 右前机身棱角
    ctx.lineTo(11, 14);      // 右中后机身
    ctx.lineTo(6, 27);       // 右机尾收口
    ctx.lineTo(0, 23);       // 机尾中心
    ctx.lineTo(-6, 27);      // 左机尾收口
    ctx.lineTo(-11, 14);     // 左中后机身
    ctx.lineTo(-9, -14);     // 左前机身棱角
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 左半侧机鼻高光受光面
    ctx.fillStyle = 'rgba(237, 248, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(-8.5, -14);
    ctx.lineTo(-10, 12);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();

    // 右半侧机身背光暗面
    ctx.fillStyle = 'rgba(4, 8, 24, 0.32)';
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(8.5, -14);
    ctx.lineTo(10, 12);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 绘制中央高质感科幻玻璃驾驶舱（双层高光反射与舱内仪表微光）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderCockpit(ctx) {
    const canopyGrad = ctx.createLinearGradient(-4, -23, 4, 6);
    canopyGrad.addColorStop(0, '#FFFFFF');
    canopyGrad.addColorStop(0.32, '#21E6FF');
    canopyGrad.addColorStop(0.75, '#0051B8');
    canopyGrad.addColorStop(1, '#081A4B');

    ctx.fillStyle = canopyGrad;
    ctx.strokeStyle = '#EDF8FF';
    ctx.lineWidth = 1.1;

    // 菱形流线驾驶舱盖
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(5.4, -9);
    ctx.lineTo(3.8, 3);
    ctx.lineTo(0, 6.5);
    ctx.lineTo(-3.8, 3);
    ctx.lineTo(-5.4, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 主高光弧形玻璃反光带
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-0.8, -20);
    ctx.lineTo(2.0, -10);
    ctx.lineTo(0.8, -2.5);
    ctx.lineTo(-2.1, -9.5);
    ctx.closePath();
    ctx.fill();

    // 副反光亮斑
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(-1.2, 1.2, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 绘制紫色/粉色能量核心呼吸效果与翼尖点缀光效
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} pulse 呼吸系数 [0, 1]
   */
  _renderEnergyCoreAndAccents(ctx, pulse) {
    ctx.save();

    // 中央紫色+粉色高能反应堆核心（位于驾驶舱正后方，带明显呼吸脉动）
    const coreY = 13;
    const coreRadius = 4.6 + pulse * 1.4 + this.thrustIntensity * 0.9;

    const coreGrad = ctx.createRadialGradient(0, coreY, 0.6, 0, coreY, coreRadius * 2.1);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.35, '#FF3BA7');
    coreGrad.addColorStop(0.7, '#895CFF');
    coreGrad.addColorStop(1, 'rgba(137, 92, 255, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, coreY, coreRadius * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // 核心菱形粉色晶核
    const innerScale = 0.92 + pulse * 0.18;
    ctx.fillStyle = '#FF3BA7';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(0, coreY - 4.3 * innerScale);
    ctx.lineTo(3.7 * innerScale, coreY);
    ctx.lineTo(0, coreY + 4.3 * innerScale);
    ctx.lineTo(-3.7 * innerScale, coreY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 左右翼尖粉色脉冲航行灯
    ctx.fillStyle = '#FF3BA7';
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sign * 31.5, 11, 1.8 + pulse * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
