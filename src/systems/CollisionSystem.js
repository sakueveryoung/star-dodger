/**
 * 《星际躲避者 (Star Dodger)》碰撞检测与响应系统
 * 职责：
 * 1. 复用 math.js 中基于距离平方的 checkCircleCollision 算法（避免高频开方运算）
 * 2. 检测玩家飞船与活跃陨石的碰撞：确保单颗陨石最多触发一次碰撞、立即回收陨石并触发爆炸碎裂粒子
 * 3. 检测玩家飞船与能量晶体的碰撞：确保单颗晶体只允许收集一次、立即回收晶体并触发青紫色爆发粒子
 * 4. 提供清晰的事件订阅接口（onMeteorHit / onCrystalCollect），供后续阶段接入生命值与积分系统
 */
import { checkCircleCollision } from '../utils/math.js';

export class CollisionSystem {
  constructor() {
    /** @type {Set<Function>} 玩家碰撞陨石事件监听器集合 */
    this._meteorHitListeners = new Set();

    /** @type {Set<Function>} 玩家收集能量晶体事件监听器集合 */
    this._crystalCollectListeners = new Set();

    /** 碰撞统计信息（用于运行期监控与测试验证） */
    this.stats = {
      meteorHits: 0,
      crystalCollects: 0,
      lastMeteorHit: null,
      lastCrystalCollect: null
    };
  }

  /**
   * 订阅玩家与陨石碰撞事件（预留给 Phase 4 生命值扣除与屏幕震动系统）
   * @param {(event: {type: string, x: number, y: number, radius: number, playerX: number, playerY: number}) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onMeteorHit(callback) {
    if (typeof callback === 'function') {
      this._meteorHitListeners.add(callback);
    }
    return () => this._meteorHitListeners.delete(callback);
  }

  /**
   * 订阅玩家收集能量晶体事件（预留给 Phase 4 积分结算系统 ScoreManager）
   * @param {(event: {type: string, x: number, y: number, radius: number, scoreValue: number}) => void} callback
   * @returns {Function} 取消订阅函数
   */
  onCrystalCollect(callback) {
    if (typeof callback === 'function') {
      this._crystalCollectListeners.add(callback);
    }
    return () => this._crystalCollectListeners.delete(callback);
  }

  /**
   * 执行单帧碰撞检测（支持同帧多颗陨石/晶体同时接触的准确逐一判定与防重复触发）
   * @param {import('../entities/Player.js').Player} player 玩家飞船实例
   * @param {import('./SpawnSystem.js').SpawnSystem} spawnSystem 生成与对象池管理系统
   * @param {import('./ParticleSystem.js').ParticleSystem} [particleSystem] 粒子特效系统
   */
  update(player, spawnSystem, particleSystem) {
    if (!player || !spawnSystem) {
      return;
    }

    const px = player.x;
    const py = player.y;
    const pr = player.radius;

    // 1. 检测玩家与所有活跃陨石的碰撞
    spawnSystem.meteorPool.forEachActive((meteor) => {
      // 防御性检查：已标记碰撞或非活跃状态的陨石绝不重复检测
      if (!meteor || !meteor.active || meteor.hasCollided) {
        return;
      }

      if (checkCircleCollision(px, py, pr, meteor.x, meteor.y, meteor.radius)) {
        // 立即锁定碰撞标记，杜绝同一颗陨石在同帧或连续帧中重复触发碰撞
        meteor.hasCollided = true;

        const hitEvent = {
          type: 'METEOR_HIT',
          x: meteor.x,
          y: meteor.y,
          radius: meteor.radius,
          playerX: px,
          playerY: py,
          dirX: meteor.x - px + (meteor.vx || 0) * 0.12,
          dirY: meteor.y - py + (meteor.vy || 230) * 0.15
        };

        // 立即将碰撞后的陨石回收到对象池
        spawnSystem.releaseMeteor(meteor, 'collision');

        // 触发带冲击方向性的陨石碎裂与爆炸粒子特效
        if (particleSystem) {
          particleSystem.emitMeteorExplosion(
            hitEvent.x,
            hitEvent.y,
            hitEvent.radius,
            hitEvent.dirX,
            hitEvent.dirY
          );
        }

        this.stats.meteorHits++;
        this.stats.lastMeteorHit = hitEvent;

        // 派发碰撞事件通知外部系统
        for (const listener of this._meteorHitListeners) {
          try {
            listener(hitEvent);
          } catch (err) {
            console.error('[CollisionSystem] onMeteorHit 回调执行异常:', err);
          }
        }
      }
    });

    // 2. 检测玩家与所有活跃能量晶体的碰撞
    spawnSystem.crystalPool.forEachActive((crystal) => {
      // 防御性检查：已收集或非活跃状态的晶体绝不重复触发
      if (!crystal || !crystal.active || crystal.isCollected) {
        return;
      }

      if (checkCircleCollision(px, py, pr, crystal.x, crystal.y, crystal.radius)) {
        // 立即锁定已收集标记，确保单颗晶体只允许收集一次
        crystal.isCollected = true;

        const collectEvent = {
          type: 'CRYSTAL_COLLECTED',
          x: crystal.x,
          y: crystal.y,
          radius: crystal.radius,
          scoreValue: crystal.scoreValue
        };

        // 立即将收集后的晶体回收到对象池
        spawnSystem.releaseCrystal(crystal, 'collected');

        // 触发能量晶体青紫色爆发粒子与 +10 光效
        if (particleSystem) {
          particleSystem.emitCrystalCollectBurst(
            collectEvent.x,
            collectEvent.y,
            collectEvent.scoreValue
          );
        }

        this.stats.crystalCollects++;
        this.stats.lastCrystalCollect = collectEvent;

        // 派发收集事件（向后续 ScoreManager 传递收集信息）
        for (const listener of this._crystalCollectListeners) {
          try {
            listener(collectEvent);
          } catch (err) {
            console.error('[CollisionSystem] onCrystalCollect 回调执行异常:', err);
          }
        }
      }
    });
  }

  /**
   * 重置碰撞统计计数
   */
  resetStats() {
    this.stats.meteorHits = 0;
    this.stats.crystalCollects = 0;
    this.stats.lastMeteorHit = null;
    this.stats.lastCrystalCollect = null;
  }

  /**
   * 销毁并清理所有事件监听器
   */
  destroy() {
    this._meteorHitListeners.clear();
    this._crystalCollectListeners.clear();
  }
}
