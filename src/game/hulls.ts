/**
 * v1.3 船体类型（船坞）：轻型快艇 / 标准货船 / 巨型运输舰。
 * 设计：改装等级在三种船体之间共享（升级一次，换船也保留），
 * 船体只提供各自的「基础倍率」——货位 / 载重表、推力、转向、耗煤、耐久、升限、外形尺寸。
 * 只含数据与纯函数；购买 / 切换在 economy.ts。
 */
import { TABLE } from './upgrades'

export type HullId = 'light' | 'standard' | 'giant'
export const HULL_IDS: HullId[] = ['light', 'standard', 'giant']
export type Hull = {
  id: HullId
  name: string
  icon: string
  desc: string
  cost: number
  /** 货位 / 载重（按货舱等级 Lv1..Lv4） */
  slots: number[]
  weight: number[]
  /** 推力、转向、耗煤、耐久倍率 */
  thrust: number
  turn: number
  coal: number
  hp: number
  /** 每吨所需压力倍率、空船额外所需压力 */
  loadLift: number
  baseNeed: number
  /** 升限修正（米） */
  ceiling: number
  /** 外形缩放（碰撞球、镜头距离、模型） */
  scale: number
  /** 系泊点高度修正（大船停高一点） */
  dockDy: number
  /** 只能停靠大型港口 */
  bigOnly: boolean
}

export const HULLS: Record<HullId, Hull> = {
  light: {
    id: 'light', name: '轻型快艇', icon: '➶', desc: '细长气囊 + 轻木吊舱：最快最灵活，升限更高；货少、皮薄。', cost: 1800,
    slots: [3, 3, 4, 5], weight: [6, 8, 10, 13], thrust: 1.22, turn: 1.55, coal: 0.8, hp: 0.6, loadLift: 1.25, baseNeed: -0.02, ceiling: 40, scale: 0.8, dockDy: -1.5, bigOnly: false,
  },
  standard: {
    id: 'standard', name: '标准货船', icon: '⛴', desc: '「老信天翁」：均衡的老牌货船，哪儿都能停。', cost: 0,
    slots: TABLE.hold.slots, weight: TABLE.hold.weight, thrust: 1, turn: 1, coal: 1, hp: 1, loadLift: 1, baseNeed: 0, ceiling: 0, scale: 1, dockDy: 0, bigOnly: false,
  },
  giant: {
    id: 'giant', name: '巨型运输舰', icon: '🛳', desc: '双副气囊 + 三螺旋桨的巨舰：12 货位、超大载重；吃煤、转向迟钝、需要更高锅炉压力，只能停靠大型港口。', cost: 5200,
    slots: [9, 10, 11, 12], weight: [24, 30, 36, 44], thrust: 0.92, turn: 0.45, coal: 1.45, hp: 1.8, loadLift: 0.7, baseNeed: 0.08, ceiling: -30, scale: 1.5, dockDy: 7, bigOnly: true,
  },
}
export const hullOf = (id: string | undefined) => HULLS[(id as HullId) ?? 'standard'] ?? HULLS.standard
/** 可停靠巨型运输舰的大型港口 */
export const LARGE_PORTS_TEXT = '云港 / 工坊城 / 煤矿岛 / 冰港'
/** 船坞：云港 / 工坊城 / 冰港 */
export const hasYard = (island: string) => island === 'port' || island === 'workshop' || island === 'icehub'
export const hullSlots = (h: HullId, holdLv: number) => hullOf(h).slots[Math.max(0, Math.min(3, holdLv - 1))]
export const hullWeight = (h: HullId, holdLv: number) => hullOf(h).weight[Math.max(0, Math.min(3, holdLv - 1))]
export const hullHpMax = (h: string | undefined, armorLv: number) => Math.round(TABLE.armor.hp[Math.max(0, Math.min(3, armorLv - 1))] * hullOf(h).hp)

/** v1.3 防寒锅炉罩：霜原耗煤加成由 +35% 降到 +8% */
export const COLD_COAL = 1.35
export const COLD_COAL_KIT = 1.08
export const COLD_KIT_COST = 450
