/**
 * 武器槽（v1.2）：蒸汽机炮 / 鱼叉 / 照明弹，各 3 级。
 * 只含数据与纯函数；购买在 economy.ts，战斗运行时在 combat.ts。
 * 等级 0 = 未拥有。
 */
import type { Req } from './upgrades'
import { SHOP_DISCOUNT } from './upgrades'

export type WeaponId = 'gun' | 'harpoon' | 'flare'
export const WEAPON_IDS: WeaponId[] = ['gun', 'harpoon', 'flare']
export type WeaponLevels = Record<WeaponId, number>
export const NO_WEAPONS: WeaponLevels = { gun: 0, harpoon: 0, flare: 0 }
export const WEAPON_MAX = 3

export const WTABLE = {
  /** 每发伤害、每发热量、射速（发/秒）、自动瞄准锥角（度）、射程 */
  gun: { dmg: [5, 7, 10], heat: [0.075, 0.06, 0.047], rate: [7, 7.5, 8], cone: [20, 24, 28], range: [420, 450, 480] },
  /** 命中伤害、钩住后每秒拉扯伤害、射程、最长钩住时间（秒） */
  harpoon: { dmg: [15, 24, 34], dps: [3, 5, 8], range: [220, 280, 340], hold: [12, 16, 20] },
  /** 弹药上限、干扰时间（秒）、干扰半径 */
  flare: { ammo: [3, 4, 6], dur: [6, 8, 10], radius: [650, 750, 850] },
}
export const FLARE_PRICE = 12

export const WEAPONS: Record<WeaponId, { name: string; icon: string; desc: string; cost: [number, number, number]; req: [Req | null, Req | null, Req | null]; lvNames: string[]; key: string; pad: string }> = {
  gun: { name: '蒸汽机炮', icon: '✸', desc: '速射机炮：朝镜头方向射击，带自动瞄准辅助；连射会过热', cost: [650, 1100, 1900], req: [null, null, { island: 'workshop', rep: 10 }], lvNames: ['黄铜速射炮', '双管机炮', '高压连珠炮'], key: '按住 C / 鼠标左键', pad: '按住 RB' },
  harpoon: { name: '鱼叉', icon: '⥽', desc: '钩住敌船：使其减速并被拖拽，持续拉扯伤害；再按一次松开', cost: [500, 900, 1600], req: [null, null, { island: 'workshop', rep: 8 }], lvNames: ['捕鲸鱼叉', '蒸汽绞盘鱼叉', '钢缆连发鱼叉'], key: 'G', pad: 'LB' },
  flare: { name: '照明弹', icon: '✺', desc: '诱饵弹：数秒内打断空贼追击与钩索，敌炮瞄向诱饵；弹药有限，靠港补充', cost: [200, 450, 800], req: [null, null, { island: 'port', rep: 8 }], lvNames: ['信号照明弹', '镁光诱饵弹', '星火诱饵弹'], key: 'Z', pad: '十字键 ←' },
}

export function weaponCost(w: WeaponId, lv: number, island: string) {
  if (lv >= WEAPON_MAX) return 0
  return Math.round((WEAPONS[w].cost[lv] * (SHOP_DISCOUNT[island] ?? 1)) / 10) * 10
}
export const weaponReq = (w: WeaponId, lv: number): Req | null => (lv >= WEAPON_MAX ? null : WEAPONS[w].req[lv])

/** 某武器某级属性（lv ≥ 1） */
export function weaponStats(w: WeaponId, lv: number): [string, string][] {
  const i = Math.max(0, lv - 1)
  switch (w) {
    case 'gun': return [['每发伤害', `${WTABLE.gun.dmg[i]}`], ['射速', `${WTABLE.gun.rate[i]} 发/秒`], ['连射至过热', `${Math.floor(1 / WTABLE.gun.heat[i])} 发`], ['瞄准辅助', `${WTABLE.gun.cone[i]}°`]]
    case 'harpoon': return [['命中伤害', `${WTABLE.harpoon.dmg[i]}`], ['拉扯伤害', `${WTABLE.harpoon.dps[i]}/秒`], ['射程', `${WTABLE.harpoon.range[i]} 米`], ['钩住时间', `${WTABLE.harpoon.hold[i]} 秒`]]
    case 'flare': return [['弹药上限', `${WTABLE.flare.ammo[i]} 发`], ['干扰时间', `${WTABLE.flare.dur[i]} 秒`], ['干扰半径', `${WTABLE.flare.radius[i]} 米`]]
  }
}
export const hasArms = (w: WeaponLevels | undefined) => !!w && (w.gun > 0 || w.harpoon > 0)
export const flareMax = (w: WeaponLevels) => (w.flare > 0 ? WTABLE.flare.ammo[w.flare - 1] : 0)
