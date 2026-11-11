/**
 * 《星际躲避者 (Star Dodger)》独立陨石实体模块 (Phase 6 视觉与性能优化版)
 * 职责：
 * 1. 支持 ObjectPool 池化复用（reset / onRelease），复用顶点数组降低 GC 压力
 * 2. 随机选用 5 套差异化深空矿石配色，生成不规则多边形棱角、明暗立体切面与分叉霓虹能量裂纹
 * 3. 基于 deltaTime 更新位移与自转，离开屏幕后触发自动回收
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { randomRange, randomInt, randomChoice } from '../utils/math.js';

/**
 * 5 套差异化陨石岩石与能量矿脉配色预设（避免所有陨石外观雷同）
 */
const ROCK_PALETTES = [
  {
    name: 'obsidian-purple',
    core: '#2C2550',
    mid: '#1A1634',
    dark: '#0C0A1B',
    lightFacet: 'rgba(167, 139, 250, 0.24)',
    darkFacet: 'rgba(5, 6, 16, 0.45)',
    edge: '#895CFF',
    crack: '#E879F9'
  },
  {
    name: 'abyssal-cyan',
    core: '#1D3557',
    mid: '#112239',
    dark: '#08101E',
    lightFacet: 'rgba(33, 230, 255, 0.22)',
    darkFacet: 'rgba(4, 9, 20, 0.48)',
    edge: '#21E6FF',
    crack: '#67E8F9'
  },
  {
    name: 'crimson-magenta',
    core: '#3B1D3E',
    mid: '#241129',
    dark: '#110715',
    lightFacet: 'rgba(255, 59, 167, 0.22)',
    darkFacet: 'rgba(10, 4, 14, 0.46)',
    edge: '#FF3BA7',
    crack: '#FDA4AF'
  },
  {
    name: 'cobalt-indigo',
    core: '#232B4E',
    mid: '#151A33',
    dark: '#0A0D1C',
    lightFacet: 'rgba(96, 165, 250, 0.22)',
    darkFacet: 'rgba(5, 8, 20, 0.46)',
    edge: '#6366F1',
    crack: '#21E6FF'
  },
  {
    name: 'violet-rose',
    core: '#33204A',
    mid: '#1E1330',
    dark: '#0D0818',
    lightFacet: 'rgba(217, 70, 239, 0.22)',
    darkFacet: 'rgba(7, 4, 15, 0.48)',
    edge: '#C084FC',
    crack: '#FF3BA7'
  }
];

export class Meteor {
  constructor() {
    this.active = false;
    this.hasCollided = false;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = GAME_CONFIG.METEOR.BASE_SPEED_Y || 230;
    this.radius = 28;

    this.rotation = 0;
    this.rotationSpeed = 1.0;

    /** @type {Array<{x: number, y: number, rRatio: number, angle: number}>} 外轮廓不规则多边形顶点 */
    this.vertices = [];

    /** @type {Array<{x: number, y: number}>} 内部岩石切面棱角顶点 */
    this.innerFacet = [];

    /** @type {Array<{main: Array<{x: number, y: number}>, branch: Array<{x: number, y: number}>|null}>} 分叉能量裂纹 */
    this.cracks = [];

    this.palette = ROCK_PALETTES[0];
    this._pulsePhase = 0;
  }

  /**
   * 初始化或重置陨石状态（由 ObjectPool.acquire 调用）
   * @param {Object} [options] 初始化配置
   */
  reset(options = {}) {
    const cfg = GAME_CONFIG.METEOR;

    this.active = true;
    this.hasCollided = false;

    this.radius = options.radius ?? randomRange(cfg.RADIUS_MIN, cfg.RADIUS_MAX);
    this.x = options.x ?? 0;
    this.y = options.y ?? -(this.radius + 16);

    const speedMultiplier = options.speedMultiplier ?? 1.0;
    const baseVy = options.vy ?? randomRange(cfg.BASE_SPEED_MIN, cfg.BASE_SPEED_MAX);
    this.vy = baseVy * speedMultiplier;
    this.vx = options.vx ?? randomRange(-cfg.DRIFT_SPEED_X, cfg.DRIFT_SPEED_X);

    const rotDir = Math.random() < 0.5 ? -1 : 1;
    this.rotation = randomRange(0, Math.PI * 2);
    this.rotationSpeed =
      options.rotationSpeed ??
      rotDir * randomRange(cfg.ROTATION_SPEED_MIN, cfg.ROTATION_SPEED_MAX);

    this.palette = randomChoice(ROCK_PALETTES) || ROCK_PALETTES[0];
    this._pulsePhase = randomRange(0, Math.PI * 2);

    this._generateIrregularGeometry();
  }

  /**
   * 回收清理钩子（由 ObjectPool.release 调用）
   */
  onRelease() {
    this.active = false;
    this.hasCollided = false;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * 生成自然的不规则多边形轮廓、岩石明暗切面与分叉霓虹裂纹（复用数组实例）
   */
  _generateIrregularGeometry() {
    const cfg = GAME_CONFIG.METEOR;
    const vertexCount = randomInt(cfg.VERTEX_MIN || 8, cfg.VERTEX_MAX || 13);

    this.vertices.length = 0;
    this.innerFacet.length = 0;
    this.cracks.length = 0;

    const angleStep = (Math.PI * 2) / vertexCount;

    for (let i = 0; i < vertexCount; i++) {
      const jitterAngle = i * angleStep + randomRange(-angleStep * 0.26, angleStep * 0.26);
      const rRatio = randomRange(0.78, 1.14);
      const r = this.radius * rRatio;

      this.vertices.push({
        x: Math.cos(jitterAngle) * r,
        y: Math.sin(jitterAngle) * r,
        rRatio,
        angle: jitterAngle
      });

      const innerR = r * randomRange(0.38, 0.58);
      this.innerFacet.push({
        x: Math.cos(jitterAngle + 0.16) * innerR,
        y: Math.sin(jitterAngle + 0.16) * innerR
      });
    }

    // 生成 2 ~ 4 条带侧向分叉的岩石能量裂纹
    const crackCount = randomInt(2, 4);
    const step = Math.max(2, Math.floor(vertexCount / crackCount));
    for (let c = 0; c < crackCount; c++) {
      const vIdx = (c * step + randomInt(0, 1)) % vertexCount;
      const startV = this.vertices[vIdx];
      const midAngle = startV.angle + randomRange(-0.35, 0.35);
      const midR = this.radius * randomRange(0.45, 0.64);
      const endAngle = midAngle + randomRange(-0.55, 0.55);
      const endR = this.radius * randomRange(0.12, 0.26);

      const midPt = { x: Math.cos(midAngle) * midR, y: Math.sin(midAngle) * midR };
      const branchAngle = midAngle + (c % 2 === 0 ? 0.65 : -0.65);
      const branchR = midR * 0.62;

      this.cracks.push({
        main: [
          { x: startV.x * 0.96, y: startV.y * 0.96 },
          midPt,
          { x: Math.cos(endAngle) * endR, y: Math.sin(endAngle) * endR }
        ],
        branch: [
          midPt,
          { x: Math.cos(branchAngle) * branchR, y: Math.sin(branchAngle) * branchR }
        ]
      });
    }
  }

  /**
   * 基于 deltaTime 更新陨石位置与旋转角度
   * @param {number} deltaTime 帧间隔（秒）
   * @param {number} viewportWidth 当前视口宽度
   * @param {number} viewportHeight 当前视口高度
   * @returns {boolean} 是否仍在有效屏幕区域内
   */
  update(deltaTime, viewportWidth, viewportHeight) {
    if (!this.active) {
      return false;
    }

    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.rotation += this.rotationSpeed * deltaTime;
    this._pulsePhase += deltaTime * 3.5;

    const margin = this.radius + 48;
    if (
      this.y - margin > viewportHeight ||
      this.x + margin < -60 ||
      this.x - margin > viewportWidth + 60
    ) {
      return false;
    }

    return true;
  }

  /**
   * 绘制不规则多边形岩石质感陨石、明暗立体切面与分叉霓虹裂纹
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const vLen = this.vertices.length;
    if (!this.active || vLen < 3) {
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // 1. 绘制不规则多边形岩石主体
    const rockGrad = ctx.createRadialGradient(
      -this.radius * 0.28,
      -this.radius * 0.28,
      this.radius * 0.08,
      0,
      0,
      this.radius * 1.15
    );
    rockGrad.addColorStop(0, this.palette.core);
    rockGrad.addColorStop(0.58, this.palette.mid);
    rockGrad.addColorStop(1, this.palette.dark);

    ctx.shadowColor = this.palette.edge;
    ctx.shadowBlur = 9;
    ctx.fillStyle = rockGrad;
    ctx.strokeStyle = this.palette.edge;
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
    for (let i = 1; i < vLen; i++) {
      ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. 关闭外阴影，绘制向阳切面与背阴切面，强化岩石立体感
    ctx.shadowBlur = 0;
    if (this.innerFacet.length >= 3) {
      const halfIdx = Math.floor(vLen * 0.5);

      // 左上受光亮切面
      ctx.fillStyle = this.palette.lightFacet;
      ctx.beginPath();
      ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
      for (let i = 1; i <= halfIdx; i++) {
        ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
      }
      for (let i = halfIdx; i >= 0; i--) {
        ctx.lineTo(this.innerFacet[i].x, this.innerFacet[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // 右下背光暗切面
      ctx.fillStyle = this.palette.darkFacet;
      ctx.beginPath();
      ctx.moveTo(this.innerFacet[0].x, this.innerFacet[0].y);
      for (let i = 1; i < this.innerFacet.length; i++) {
        ctx.lineTo(this.innerFacet[i].x, this.innerFacet[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // 内部岩脊折线
      ctx.strokeStyle = 'rgba(237, 248, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.innerFacet[0].x, this.innerFacet[0].y);
      for (let i = 1; i < this.innerFacet.length; i++) {
        ctx.lineTo(this.innerFacet[i].x, this.innerFacet[i].y);
      }
      ctx.closePath();
      for (let i = 0; i < vLen; i += 2) {
        ctx.moveTo(this.vertices[i].x, this.vertices[i].y);
        ctx.lineTo(this.innerFacet[i].x, this.innerFacet[i].y);
      }
      ctx.stroke();
    }

    // 3. 绘制分叉霓虹能量裂纹
    const crackAlpha = 0.68 + (Math.sin(this._pulsePhase) + 1) * 0.16;
    ctx.strokeStyle = this.palette.crack;
    ctx.globalAlpha = crackAlpha;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    for (let c = 0; c < this.cracks.length; c++) {
      const { main, branch } = this.cracks[c];
      ctx.moveTo(main[0].x, main[0].y);
      for (let p = 1; p < main.length; p++) {
        ctx.lineTo(main[p].x, main[p].y);
      }
      if (branch && branch.length === 2) {
        ctx.moveTo(branch[0].x, branch[0].y);
        ctx.lineTo(branch[1].x, branch[1].y);
      }
    }
    ctx.stroke();

    // 裂纹高光白芯
    ctx.strokeStyle = '#FFFFFF';
    ctx.globalAlpha = crackAlpha * 0.72;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
