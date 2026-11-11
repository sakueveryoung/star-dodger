/**
 * 《星际躲避者 (Star Dodger)》深空霓虹背景渲染系统
 * 负责动态绘制：
 * 1. 深空蓝多层渐变底色与战术坐标微光网格
 * 2. 能量紫、霓虹粉、霓虹青三色动态呼吸星云
 * 3. 远/中/近三层不同速度的视差滚动与闪烁星空
 */
import { GAME_CONFIG } from '../config/gameConfig.js';
import { randomRange, randomChoice, clamp, lerp } from '../utils/math.js';

/**
 * 星云色彩预设（能量紫、霓虹粉、霓虹青，优化多层次渐变并控制峰值亮度，确保前景飞船与陨石清晰度）
 */
const NEBULA_PALETTES = [
  {
    name: 'purple',
    core: 'rgba(137, 92, 255, 0.16)',
    inner: 'rgba(188, 19, 254, 0.12)',
    mid: 'rgba(98, 28, 185, 0.06)',
    outer: 'rgba(137, 92, 255, 0)'
  },
  {
    name: 'pink',
    core: 'rgba(255, 59, 167, 0.14)',
    inner: 'rgba(255, 0, 127, 0.10)',
    mid: 'rgba(175, 24, 110, 0.05)',
    outer: 'rgba(255, 59, 167, 0)'
  },
  {
    name: 'cyan',
    core: 'rgba(33, 230, 255, 0.14)',
    inner: 'rgba(0, 195, 255, 0.10)',
    mid: 'rgba(12, 110, 185, 0.05)',
    outer: 'rgba(33, 230, 255, 0)'
  }
];

/**
 * 星点色彩权重池
 */
const STAR_COLORS = [
  '#E8F7FF', // 星光白
  '#E8F7FF',
  '#00F3FF', // 霓虹青
  '#00F3FF',
  '#BC13FE', // 能量紫
  '#FF007F'  // 霓虹粉
];

export class BackgroundSystem {
  /**
   * @param {number} width 初始视口逻辑宽度
   * @param {number} height 初始视口逻辑高度
   */
  constructor(width = GAME_CONFIG.VIEWPORT.DESIGN_WIDTH, height = GAME_CONFIG.VIEWPORT.DESIGN_HEIGHT) {
    this.width = Math.max(320, width);
    this.height = Math.max(240, height);

    /** @type {number} 全局背景速度倍率（供后续难度提升或推进加速联动） */
    this.speedScale = 1.0;

    /** @type {number} 累计运行时间（秒） */
    this._time = 0;

    /** @type {number} 背景微光网格滚动偏移量 */
    this._gridOffsetY = 0;

    /** @type {Array<Object>} 动态星云列表 */
    this.nebulae = [];

    /** @type {Array<Array<Object>>} 三层视差星空列表 */
    this.starLayers = [];

    this._initNebulae();
    this._initStarLayers();
  }

  /**
   * 初始化紫色、粉色与青色星云团
   */
  _initNebulae() {
    this.nebulae = [];
    const count = GAME_CONFIG.BACKGROUND.NEBULA_COUNT || 6;
    const minDim = Math.min(this.width, this.height);

    for (let i = 0; i < count; i++) {
      // 确保紫、粉、青三色星云均匀分布出现
      const palette = NEBULA_PALETTES[i % NEBULA_PALETTES.length];
      const baseRadius = randomRange(minDim * 0.28, minDim * 0.52);

      this.nebulae.push({
        x: randomRange(this.width * 0.1, this.width * 0.9),
        y: randomRange(0, this.height),
        baseRadius,
        radiusRatio: baseRadius / minDim,
        palette,
        speedY: randomRange(8, 18),
        driftX: randomRange(-10, 10),
        pulsePhase: randomRange(0, Math.PI * 2),
        pulseSpeed: randomRange(0.4, 0.9)
      });
    }
  }

  /**
   * 初始化远、中、近三层不同速度的视差星空
   */
  _initStarLayers() {
    this.starLayers = [];
    const layerConfigs = GAME_CONFIG.BACKGROUND.STAR_LAYERS;

    // 根据当前窗口面积与 1920x1080 参考分辨率面积比例动态微调星点数量
    const designArea = GAME_CONFIG.VIEWPORT.DESIGN_WIDTH * GAME_CONFIG.VIEWPORT.DESIGN_HEIGHT;
    const currentArea = this.width * this.height;
    const areaFactor = clamp(currentArea / designArea, 0.55, 1.5);

    for (let layerIndex = 0; layerIndex < layerConfigs.length; layerIndex++) {
      const cfg = layerConfigs[layerIndex];
      const count = Math.round(cfg.count * areaFactor);
      const stars = [];

      for (let i = 0; i < count; i++) {
        stars.push(this._createStar(cfg, layerIndex, true));
      }

      this.starLayers.push({
        config: cfg,
        layerIndex,
        stars
      });
    }
  }

  /**
   * 创建单颗星点数据
   * @param {Object} cfg 层级配置
   * @param {number} layerIndex 层级索引 (0: 远, 1: 中, 2: 近)
   * @param {boolean} randomY 是否在全屏高度内随机分布 Y 坐标
   */
  _createStar(cfg, layerIndex, randomY = false) {
    const color = layerIndex === 0 ? '#E8F7FF' : randomChoice(STAR_COLORS);
    const size = randomRange(cfg.sizeMin, cfg.sizeMax);

    return {
      x: randomRange(0, this.width),
      y: randomY ? randomRange(0, this.height) : randomRange(-20, -2),
      size,
      color,
      baseSpeed: GAME_CONFIG.BACKGROUND.BASE_SCROLL_SPEED * cfg.speedMultiplier * randomRange(0.88, 1.15),
      twinklePhase: randomRange(0, Math.PI * 2),
      twinkleSpeed: randomRange(cfg.twinkleSpeedMin, cfg.twinkleSpeedMax),
      alphaMin: cfg.alphaMin,
      alphaMax: cfg.alphaMax,
      currentAlpha: cfg.alphaMax,
      hasCrossFlare: layerIndex === 2 && size > 3.0
    };
  }

  /**
   * 响应浏览器窗口缩放，平滑映射现有星云与星点坐标
   * @param {number} newWidth 新视口宽度
   * @param {number} newHeight 新视口高度
   */
  resize(newWidth, newHeight) {
    const validWidth = Math.max(320, newWidth);
    const validHeight = Math.max(240, newHeight);

    const ratioX = validWidth / this.width;
    const ratioY = validHeight / this.height;
    const minDim = Math.min(validWidth, validHeight);

    this.width = validWidth;
    this.height = validHeight;

    // 映射星云坐标与半径
    for (let i = 0; i < this.nebulae.length; i++) {
      const nebula = this.nebulae[i];
      nebula.x *= ratioX;
      nebula.y *= ratioY;
      nebula.baseRadius = clamp(nebula.radiusRatio * minDim, 140, 620);
    }

    // 映射三层视差星星坐标
    for (let l = 0; l < this.starLayers.length; l++) {
      const stars = this.starLayers[l].stars;
      for (let i = 0; i < stars.length; i++) {
        stars[i].x = clamp(stars[i].x * ratioX, 0, this.width);
        stars[i].y = clamp(stars[i].y * ratioY, -20, this.height);
      }
    }
  }

  /**
   * 基于 deltaTime 更新星云漂移、呼吸脉冲、星空视差滚动与星点闪烁
   * @param {number} deltaTime 帧间隔（秒）
   */
  update(deltaTime) {
    this._time += deltaTime;

    // 更新深空坐标微光网格纵向滚动
    const gridSpeed = GAME_CONFIG.BACKGROUND.BASE_SCROLL_SPEED * 0.9 * this.speedScale;
    this._gridOffsetY = (this._gridOffsetY + gridSpeed * deltaTime) % 80;

    // 1. 更新星云位置与呼吸相位
    for (let i = 0; i < this.nebulae.length; i++) {
      const nebula = this.nebulae[i];
      nebula.pulsePhase += nebula.pulseSpeed * deltaTime;
      nebula.y += nebula.speedY * this.speedScale * deltaTime;
      nebula.x += Math.sin(nebula.pulsePhase * 0.7) * nebula.driftX * deltaTime;

      // 星云完全移出屏幕底部后循环回到顶部上方
      const wrapMargin = nebula.baseRadius * 1.15;
      if (nebula.y - wrapMargin > this.height) {
        nebula.y = -wrapMargin;
        nebula.x = randomRange(this.width * 0.1, this.width * 0.9);
      }
    }

    // 2. 更新三层视差星空位置与闪烁亮度
    for (let l = 0; l < this.starLayers.length; l++) {
      const layer = this.starLayers[l];
      const stars = layer.stars;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.y += star.baseSpeed * this.speedScale * deltaTime;
        star.twinklePhase += star.twinkleSpeed * deltaTime;

        // 使用正弦波在 [alphaMin, alphaMax] 之间计算星点闪烁透明度
        const wave = (Math.sin(star.twinklePhase) + 1) * 0.5;
        star.currentAlpha = lerp(star.alphaMin, star.alphaMax, wave);

        // 超出屏幕下边界后重置到顶部随机 X 位置
        if (star.y > this.height + 16) {
          star.y = randomRange(-18, -2);
          star.x = randomRange(0, this.width);
        }
      }
    }
  }

  /**
   * 绘制完整动态深空背景
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!ctx) return;

    ctx.save();

    // 1. 绘制深空蓝多层渐变底色
    this._renderDeepSpaceBase(ctx);

    // 2. 绘制缓慢滚动的科幻深空坐标微光网格
    this._renderSpaceGrid(ctx);

    // 3. 绘制紫色、粉色、青色发光星云
    this._renderNebulae(ctx);

    // 4. 绘制三层视差闪烁星空
    this._renderStarLayers(ctx);

    ctx.restore();
  }

  /**
   * 绘制深空蓝线性与径向复合渐变底色
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderDeepSpaceBase(ctx) {
    const linearGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    linearGrad.addColorStop(0, '#040612');
    linearGrad.addColorStop(0.5, GAME_CONFIG.COLORS.BG_SPACE_MID);
    linearGrad.addColorStop(1, GAME_CONFIG.COLORS.BG_DEEP_SPACE);

    ctx.fillStyle = linearGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // 中心偏上的深空环境光晕
    const pulseShift = Math.sin(this._time * 0.4) * 0.04;
    const radialGrad = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * (0.38 + pulseShift),
      20,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.75
    );
    radialGrad.addColorStop(0, 'rgba(18, 28, 74, 0.55)');
    radialGrad.addColorStop(0.55, 'rgba(10, 14, 39, 0.25)');
    radialGrad.addColorStop(1, 'rgba(5, 7, 20, 0)');

    ctx.fillStyle = radialGrad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * 绘制缓慢流动的微光战术网格线（增强背景滚动参照感）
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderSpaceGrid(ctx) {
    const gridStep = 88;
    ctx.strokeStyle = 'rgba(33, 230, 255, 0.022)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = (this.width % gridStep) * 0.5; x < this.width; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = this._gridOffsetY; y < this.height; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  /**
   * 绘制紫色、粉色和青色多层渐变动态星云团
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderNebulae(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.nebulae.length; i++) {
      const nebula = this.nebulae[i];
      const scalePulse = 1 + Math.sin(nebula.pulsePhase) * 0.1;
      const radius = nebula.baseRadius * scalePulse;

      const grad = ctx.createRadialGradient(
        nebula.x,
        nebula.y,
        radius * 0.04,
        nebula.x,
        nebula.y,
        radius
      );
      grad.addColorStop(0, nebula.palette.core || nebula.palette.inner);
      grad.addColorStop(0.32, nebula.palette.inner);
      grad.addColorStop(0.65, nebula.palette.mid);
      grad.addColorStop(1, nebula.palette.outer);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(nebula.x, nebula.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 绘制远、中、近三层视差闪烁星空及近景流光星芒
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderStarLayers(ctx) {
    ctx.save();

    for (let l = 0; l < this.starLayers.length; l++) {
      const { config, layerIndex, stars } = this.starLayers[l];

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        ctx.globalAlpha = star.currentAlpha;
        ctx.fillStyle = star.color;

        // 近景星层绘制微弱流光尾迹，强化速度层次感
        if (layerIndex === 2) {
          const trailLength = star.size * 4.2 * this.speedScale;
          const trailGrad = ctx.createLinearGradient(
            star.x,
            star.y - trailLength,
            star.x,
            star.y
          );
          trailGrad.addColorStop(0, 'rgba(0, 243, 255, 0)');
          trailGrad.addColorStop(1, star.color);

          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = star.size * 0.7;
          ctx.beginPath();
          ctx.moveTo(star.x, star.y - trailLength);
          ctx.lineTo(star.x, star.y);
          ctx.stroke();
        }

        // 绘制发光光晕（针对中景与近景高亮星星）
        if (config.glow) {
          ctx.shadowColor = star.color;
          ctx.shadowBlur = layerIndex === 2 ? 10 : 5;
        } else {
          ctx.shadowBlur = 0;
        }

        // 绘制星体核心
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // 近景大星点绘制十字星芒
        if (star.hasCrossFlare) {
          const flareLen = star.size * 3.0;
          ctx.strokeStyle = star.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(star.x - flareLen, star.y);
          ctx.lineTo(star.x + flareLen, star.y);
          ctx.moveTo(star.x, star.y - flareLen);
          ctx.lineTo(star.x, star.y + flareLen);
          ctx.stroke();
        }
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
