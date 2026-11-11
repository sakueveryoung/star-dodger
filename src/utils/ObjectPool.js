/**
 * 《星际躲避者 (Star Dodger)》通用对象池模块
 * 用于管理陨石、能量晶体、粒子、浮动文字等高频创建与销毁的对象，消除运行期 GC 抖动
 */

export class ObjectPool {
  /**
   * @param {Function} createFn 创建新对象实例的工厂函数
   * @param {Object} [options] 配置项
   * @param {Function} [options.resetFn] 对象重置钩子 (item, ...args) => void
   * @param {number} [options.initialSize=0] 初始预分配数量
   * @param {number} [options.maxSize=2000] 对象池最大容量保护上限
   */
  constructor(createFn, options = {}) {
    if (typeof createFn !== 'function') {
      throw new TypeError('[ObjectPool] createFn 必须是一个有效的工厂函数');
    }

    this._createFn = createFn;
    this._resetFn = typeof options.resetFn === 'function' ? options.resetFn : null;
    this._maxSize = Number.isFinite(options.maxSize) && options.maxSize > 0 ? options.maxSize : 2000;

    /** @type {Array<any>} 空闲对象栈 */
    this._freeList = [];

    /** @type {Set<any>} 空闲对象集合（用于 O(1) 防止重复回收） */
    this._freeSet = new Set();

    /** @type {Set<any>} 当前活跃对象集合 */
    this._activeSet = new Set();

    /** @type {Array<any>} 复用遍历快照缓冲区，消除每帧 Array.from 临时数组分配 */
    this._iterBuffer = [];

    const initialSize = Math.max(0, Math.floor(options.initialSize || 0));
    this._prewarm(initialSize);
  }

  /**
   * 预分配指定数量的对象到空闲池
   * @param {number} count 预分配数量
   */
  _prewarm(count) {
    const targetCount = Math.min(count, this._maxSize);
    for (let i = 0; i < targetCount; i++) {
      const item = this._safeCreate();
      if (item !== null) {
        this._freeList.push(item);
        this._freeSet.add(item);
      }
    }
  }

  /**
   * 安全调用工厂函数创建对象
   * @returns {any|null}
   */
  _safeCreate() {
    try {
      const item = this._createFn();
      if (item === null || typeof item !== 'object') {
        console.warn('[ObjectPool] 工厂函数返回值不是有效对象');
        return null;
      }
      return item;
    } catch (err) {
      console.error('[ObjectPool] 创建对象实例失败:', err);
      return null;
    }
  }

  /**
   * 从对象池获取一个对象实例并激活
   * @param {...any} args 传递给对象 reset 方法或 resetFn 的初始化参数
   * @returns {any|null} 激活的对象实例
   */
  acquire(...args) {
    let item = null;

    if (this._freeList.length > 0) {
      item = this._freeList.pop();
      this._freeSet.delete(item);
    } else {
      item = this._safeCreate();
    }

    if (!item) {
      return null;
    }

    // 执行重置逻辑
    try {
      if (this._resetFn) {
        this._resetFn(item, ...args);
      } else if (typeof item.reset === 'function') {
        item.reset(...args);
      }
      if ('active' in item) {
        item.active = true;
      }
    } catch (err) {
      console.error('[ObjectPool] 初始化/重置对象时发生异常:', err);
    }

    this._activeSet.add(item);
    return item;
  }

  /**
   * 将单个对象回收到对象池（自带防重复回收与异常保护）
   * @param {any} item 待回收的对象
   * @returns {boolean} 是否成功回收
   */
  release(item) {
    if (!item || typeof item !== 'object') {
      return false;
    }

    // 防止重复回收已经在空闲池中的对象
    if (this._freeSet.has(item)) {
      return false;
    }

    // 仅回收属于当前活跃集合的对象
    if (!this._activeSet.has(item)) {
      return false;
    }

    this._activeSet.delete(item);

    try {
      if (typeof item.onRelease === 'function') {
        item.onRelease();
      }
      if ('active' in item) {
        item.active = false;
      }
    } catch (err) {
      console.error('[ObjectPool] 对象回收清理钩子异常:', err);
    }

    // 超过容量上限则直接丢弃交给 GC，避免内存无限增长
    if (this._freeList.length < this._maxSize) {
      this._freeList.push(item);
      this._freeSet.add(item);
    }

    return true;
  }

  /**
   * 批量回收当前所有活跃对象
   */
  releaseAll() {
    if (this._activeSet.size === 0) {
      return;
    }
    const snapshot = Array.from(this._activeSet);
    for (let i = 0; i < snapshot.length; i++) {
      this.release(snapshot[i]);
    }
  }

  /**
   * 安全遍历所有当前活跃的对象（支持在遍历回调中安全调用 release，且复用缓冲区避免 GC 分配）
   * @param {(item: any, index: number) => void} callback 遍历回调函数
   */
  forEachActive(callback) {
    const size = this._activeSet.size;
    if (typeof callback !== 'function' || size === 0) {
      return;
    }

    const buffer = this._iterBuffer;
    buffer.length = 0;
    for (const item of this._activeSet) {
      buffer.push(item);
    }

    for (let i = 0; i < size; i++) {
      const item = buffer[i];
      if (this._activeSet.has(item)) {
        try {
          callback(item, i);
        } catch (err) {
          console.error('[ObjectPool] forEachActive 回调执行异常:', err);
        }
      }
    }
    buffer.length = 0;
  }

  /**
   * 获取当前活跃对象数量
   * @returns {number}
   */
  get activeCount() {
    return this._activeSet.size;
  }

  /**
   * 获取当前空闲对象数量
   * @returns {number}
   */
  get freeCount() {
    return this._freeList.length;
  }

  /**
   * 获取对象池统计信息
   * @returns {{active: number, free: number, total: number}}
   */
  getStats() {
    return {
      active: this._activeSet.size,
      free: this._freeList.length,
      total: this._activeSet.size + this._freeList.length
    };
  }
}
