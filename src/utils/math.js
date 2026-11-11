/**
 * 《星际躲避者 (Star Dodger)》数学与几何物理工具库
 * 提供随机数生成、数值钳制、线性插值、距离计算、向量归一化与圆形碰撞检测函数
 */

/**
 * 生成 [min, max) 区间内的随机浮点数
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {number} 随机浮点数
 */
export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 生成 [min, max] 闭区间内的随机整数
 * @param {number} min 最小整数
 * @param {number} max 最大整数
 * @returns {number} 随机整数
 */
export function randomInt(min, max) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

/**
 * 从非空数组中随机抽取一个元素
 * @template T
 * @param {T[]} array 目标数组
 * @returns {T|undefined} 随机元素
 */
export function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined;
  }
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * 将数值限制在 [min, max] 范围内
 * @param {number} value 输入值
 * @param {number} min 下限
 * @param {number} max 上限
 * @returns {number} 限制后的数值
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 线性插值 (Linear Interpolation)
 * @param {number} start 起始值
 * @param {number} end 目标值
 * @param {number} t 插值权重 [0, 1]
 * @returns {number} 插值结果
 */
export function lerp(start, end, t) {
  const clampedT = clamp(t, 0, 1);
  return start + (end - start) * clampedT;
}

/**
 * 计算两点之间的距离平方（避免开方运算，适用于高频距离比较）
 * @param {number} x1 点1 X坐标
 * @param {number} y1 点1 Y坐标
 * @param {number} x2 点2 X坐标
 * @param {number} y2 点2 Y坐标
 * @returns {number} 距离的平方
 */
export function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * 计算两点之间的欧几里得距离
 * @param {number} x1 点1 X坐标
 * @param {number} y1 点1 Y坐标
 * @param {number} x2 点2 X坐标
 * @param {number} y2 点2 Y坐标
 * @returns {number} 两点距离
 */
export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * 二维向量归一化（将非零向量转化为单位向量）
 * @param {number} x 向量 X 分量
 * @param {number} y 向量 Y 分量
 * @returns {{x: number, y: number, length: number}} 归一化后的单位向量及原模长
 */
export function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= 1e-8) {
    return { x: 0, y: 0, length: 0 };
  }
  return {
    x: x / length,
    y: y / length,
    length
  };
}

/**
 * 圆形碰撞检测辅助函数（基于距离平方判定两个圆是否相交）
 * @param {number} x1 圆1中心 X
 * @param {number} y1 圆1中心 Y
 * @param {number} r1 圆1半径
 * @param {number} x2 圆2中心 X
 * @param {number} y2 圆2中心 Y
 * @param {number} r2 圆2半径
 * @returns {boolean} 是否发生碰撞
 */
export function checkCircleCollision(x1, y1, r1, x2, y2, r2) {
  const radiusSum = Math.max(0, r1) + Math.max(0, r2);
  return distanceSq(x1, y1, x2, y2) <= radiusSum * radiusSum;
}
