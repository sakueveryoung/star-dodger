/**
 * 《星际躲避者 (Star Dodger)》全局参数集中配置文件
 * 所有游戏核心数值、视觉色彩、难度曲线、对象池容量统一在此维护
 */
export const GAME_CONFIG = {
  // 游戏基础与视口配置（以 1920x1080 为设计参考分辨率，自动适配任意浏览器窗口）
  VIEWPORT: {
    DESIGN_WIDTH: 1920,
    DESIGN_HEIGHT: 1080,
    MAX_DELTA_TIME: 0.1, // 最大帧间隔（秒），防止切换标签页导致物理瞬移
    MAX_DPR: 2           // 最大设备像素比，平衡高清画质与渲染性能
  },

  // 深空背景与三层视差星空配置
  BACKGROUND: {
    BASE_SCROLL_SPEED: 18, // 背景基准滚动速度
    NEBULA_COUNT: 5,       // 动态星云团数量
    STAR_LAYERS: [
      {
        name: 'far',       // 远景深空星层：数量多、体积小、移动慢
        count: 110,
        speedMultiplier: 1.0,
        sizeMin: 0.8,
        sizeMax: 1.6,
        twinkleSpeedMin: 0.8,
        twinkleSpeedMax: 2.0,
        alphaMin: 0.25,
        alphaMax: 0.65,
        glow: false
      },
      {
        name: 'mid',       // 中景霓虹星层：数量适中、带色彩倾向与呼吸闪烁
        count: 65,
        speedMultiplier: 2.4,
        sizeMin: 1.4,
        sizeMax: 2.6,
        twinkleSpeedMin: 1.5,
        twinkleSpeedMax: 3.5,
        alphaMin: 0.4,
        alphaMax: 0.88,
        glow: true
      },
      {
        name: 'near',      // 近景高速流光星层：体积大、带十字星芒或发光尾迹、移动快
        count: 28,
        speedMultiplier: 5.2,
        sizeMin: 2.2,
        sizeMax: 3.8,
        twinkleSpeedMin: 2.2,
        twinkleSpeedMax: 4.8,
        alphaMin: 0.6,
        alphaMax: 1.0,
        glow: true
      }
    ]
  },

  // 科幻霓虹美术调色盘
  COLORS: {
    BG_DEEP_SPACE: '#050714',     // 深空底色
    BG_SPACE_MID: '#0A0E27',      // 深空蓝中调
    NEON_CYAN: '#00F3FF',         // 霓虹青（主色调 / 飞船 / 护盾）
    NEON_PURPLE: '#BC13FE',       // 霓虹紫（星云 / 辅助光效 / 陨石轮廓）
    NEON_PINK: '#FF007F',         // 霓虹粉（能量晶体 / 危险高光 / 警报）
    NEON_MAGENTA: '#FF2A85',      // 亮洋红（受击特效 / 暴走陨石）
    STAR_WHITE: '#E8F7FF',        // 星光白
    HUD_GLASS: 'rgba(10, 14, 39, 0.72)' // HUD 毛玻璃底色
  },

  // 玩家飞船配置
  PLAYER: {
    INITIAL_HEALTH: 3,            // 初始 3 格生命值
    MAX_HEALTH: 3,                // 最大生命值
    SPEED: 450,                   // 移动速度（逻辑像素/秒）
    ACCELERATION: 26,             // 移动加速平滑响应系数
    DECELERATION: 38,             // 停止按键后的快速阻尼制动系数
    STOP_THRESHOLD: 12,           // 速度归零阈值（逻辑像素/秒）
    RADIUS: 26,                   // 实际圆形碰撞判定半径（逻辑像素）
    WIDTH: 68,                    // 飞船视觉总翼展宽度（逻辑像素）
    HEIGHT: 74,                   // 飞船视觉总机身长度（逻辑像素）
    BOUNDARY_PADDING: 14,         // 飞船机翼距离画布边缘的额外安全边距（逻辑像素）
    SPAWN_X_RATIO: 0.5,           // 初始生成位置水平比例（居中）
    SPAWN_Y_RATIO: 0.78,          // 初始生成位置垂直比例（中央偏下区域）
    THRUSTER_OFFSET_X: 13,        // 左右双推进器距机身中轴线水平偏移
    THRUSTER_OFFSET_Y: 30,        // 双推进器喷口距飞船中心的纵向偏移
    INVINCIBLE_DURATION: 1.2,     // 受击后无敌时间（1.2秒）
    BLINK_INTERVAL: 0.08          // 无敌闪烁间隔（秒）
  },

  // 推进器尾焰与粒子系统配置
  PARTICLE: {
    MAX_ACTIVE: 360,              // 同屏最大活跃粒子数量上限（含尾焰、陨石碎裂、晶体爆发与光环）
    IDLE_EMIT_RATE: 36,           // 静止待机时每个推进器每秒发射粒子数
    MOVE_EMIT_RATE: 85,           // 移动推进时每个推进器每秒发射粒子数
    IDLE_SPEED_MIN: 75,           // 待机尾焰粒子最小喷射速度（像素/秒）
    IDLE_SPEED_MAX: 135,          // 待机尾焰粒子最大喷射速度（像素/秒）
    MOVE_SPEED_MIN: 165,          // 移动尾焰粒子最小喷射速度（像素/秒）
    MOVE_SPEED_MAX: 280,          // 移动尾焰粒子最大喷射速度（像素/秒）
    LIFE_MIN: 0.16,               // 尾焰粒子最小生命周期（秒）
    LIFE_MAX: 0.38,               // 尾焰粒子最大生命周期（秒）
    SIZE_MIN: 2.2,                // 尾焰粒子最小初始半径
    SIZE_MAX: 5.4,                // 尾焰粒子最大初始半径
    SPREAD_X: 28                  // 尾焰粒子水平随机扩散速度范围
  },

  // 陨石生成与物理配置
  METEOR: {
    BASE_SPAWN_INTERVAL: 1.4,     // LV.1 初始生成间隔（1.4秒）
    SPAWN_JITTER: 0.12,           // 生成间隔微幅浮动范围
    MIN_SPAWN_INTERVAL: 0.6,      // 最高难度下的最小生成间隔（不低于0.6秒）
    BASE_SPEED_Y: 230,            // 初始基准垂直下落速度（230px/s）
    BASE_SPEED_MIN: 185,          // 基础最小下落速度（像素/秒）
    BASE_SPEED_MAX: 285,          // 基础最大下落速度（像素/秒）
    DRIFT_SPEED_X: 42,            // 水平随机漂移速度范围（像素/秒）
    RADIUS_MIN: 18,               // 最小陨石半径（18px）
    RADIUS_MAX: 42,               // 最大陨石半径（42px）
    ROTATION_SPEED_MIN: 0.6,      // 最小自转角速度（弧度/秒）
    ROTATION_SPEED_MAX: 2.6,      // 最大自转角速度（弧度/秒）
    VERTEX_MIN: 8,                // 不规则多边形最少顶点数
    VERTEX_MAX: 13,               // 不规则多边形最多顶点数
    SPAWN_MARGIN_X: 48,           // 生成位置距左右屏幕边缘的安全边距
    PLAYER_SAFE_DISTANCE: 190     // 生成时与玩家飞船的最小安全距离（避免贴脸生成直接碰撞）
  },

  // 能量晶体配置
  CRYSTAL: {
    BASE_SPAWN_INTERVAL: 6.8,     // 基准生成间隔（约6.8秒，优化中前期收集节奏）
    SPAWN_INTERVAL_MIN: 5.5,      // 最小生成间隔（秒）
    SPAWN_INTERVAL_MAX: 8.2,      // 最大生成间隔（秒）
    SPEED_MIN: 105,               // 最小缓慢下落速度（像素/秒）
    SPEED_MAX: 155,               // 最大缓慢下落速度（像素/秒）
    SWAY_AMPLITUDE_MIN: 18,       // 左右轻微漂移最小振幅（像素/秒）
    SWAY_AMPLITUDE_MAX: 40,       // 左右轻微漂移最大振幅（像素/秒）
    SWAY_FREQUENCY_MIN: 1.5,      // 左右漂移最小角频率
    SWAY_FREQUENCY_MAX: 2.8,      // 左右漂移最大角频率
    ROTATION_SPEED_MIN: 0.8,      // 晶体缓慢旋转最小角速度（弧度/秒）
    ROTATION_SPEED_MAX: 1.6,      // 晶体缓慢旋转最大角速度（弧度/秒）
    RADIUS: 18,                   // 实际碰撞与拾取半径（像素）
    SCORE_VALUE: 10,              // 收集每个能量晶体增加 10 分
    PULSE_SPEED: 5.0,             // 周期性呼吸闪烁频率
    SPAWN_MARGIN_X: 60            // 生成位置距左右屏幕边缘的安全边距
  },

  // 计分与难度递增配置
  DIFFICULTY: {
    INITIAL_LEVEL: 1,                 // 初始难度等级 LV.1
    SURVIVAL_SCORE_INTERVAL: 1.0,     // 每生存 1 秒触发一次加分
    SURVIVAL_SCORE_VALUE: 1,          // 每生存 1 秒增加 1 分
    LEVEL_UP_INTERVAL: 20.0,          // 每生存 20 秒提升一级难度
    INTERVAL_STEP_PER_LEVEL: 0.1,     // 每升一级陨石生成间隔缩短 0.1 秒 (1.4 -> 1.3 -> 1.2 -> 1.1 -> 1.0 ...)
    MIN_SPAWN_INTERVAL: 0.6,          // 最小陨石生成间隔下限（0.6秒）
    SPEED_MULTIPLIER_PER_LEVEL: 0.12, // 每升一级陨石移动速度提升比例 (+12%)
    MAX_SPEED_MULTIPLIER: 2.0         // 陨石速度倍率合理上限（最高 2.0 倍，避免后期无法躲避）
  },

  // 对象池容量预分配配置
  POOL_SIZE: {
    METEORS: 40,                  // 陨石对象池初始容量
    CRYSTALS: 15,                 // 能量晶体对象池初始容量
    PARTICLES: 360,               // 粒子对象池初始容量
    FLOATING_TEXTS: 20            // 浮动得分文字池初始容量
  },

  // 本地存储键名配置
  STORAGE_KEYS: {
    SAVE_DATA: 'starDodgerSave_v1',
    HIGH_SCORE: 'star_dodger_high_score_v1',
    AUDIO_MUTED: 'star_dodger_audio_muted_v1'
  },

  // 音频与全局 UI 默认配置（Phase 5 新增）
  AUDIO: {
    DEFAULT_SOUND_ENABLED: true,
    DEFAULT_MASTER_VOLUME: 0.8
  },

  UI: {
    VERSION: '1.0',
    TITLE_EN: 'STAR DODGER',
    TITLE_ZH: '星际躲避者',
    SUBTITLE_EN: 'SURVIVE THE COSMIC STORM'
  }
};

/**
 * 游戏状态枚举
 */
export const GAME_STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER'
};
