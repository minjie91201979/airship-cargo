/**
 * 改装：五类部件 × 4 级 + 涂装。
 * 只含数据与纯函数；购买逻辑在 economy.ts（存档在同一个 save 里）。
 */
export type Part = 'boiler' | 'envelope' | 'prop' | 'hold' | 'armor'
export const PART_IDS: Part[] = ['boiler', 'envelope', 'prop', 'hold', 'armor']
export type Levels = Record<Part, number>
export const DEFAULT_LEVELS: Levels = { boiler: 1, envelope: 1, prop: 1, hold: 1, armor: 1 }
export const MAX_LEVEL = 4

/** 各级数值（下标 0 = Lv1） */
export const TABLE = {
  boiler: { pressRate: [0.12, 0.15, 0.18, 0.22], coalMul: [1, 0.9, 0.8, 0.7] },
  envelope: { lift: [7, 7.8, 8.6, 9.6], loadLift: [0.026, 0.022, 0.018, 0.015], ceiling: [420, 460, 500, 550] },
  prop: { thrust: [2.0, 2.25, 2.55, 2.9], propRate: [0.3, 0.36, 0.43, 0.52] },
  hold: { slots: [4, 5, 6, 8], weight: [10, 14, 18, 24] },
  armor: { fragile: [1, 0.7, 0.5, 0.3], hp: [100, 140, 180, 240], bumpRes: [0, 0.15, 0.3, 0.45] },
}

/** 基础价格（Lv2 / Lv3 / Lv4），声望需求 */
export type Req = { island: string; rep: number }
export const PARTS: Record<Part, { name: string; icon: string; desc: string; cost: [number, number, number]; req: [Req | null, Req | null, Req | null]; lvNames: string[] }> = {
  boiler: { name: '锅炉', icon: '♨', desc: '压力响应更快、燃煤更省', cost: [450, 1100, 2400], req: [null, { island: 'coal', rep: 6 }, { island: 'coal', rep: 14 }], lvNames: ['铆接铁锅炉', '加强锅炉', '双烟囱锅炉', '高压复合锅炉'] },
  envelope: { name: '气囊', icon: '◯', desc: '基础浮力与载重升力、升限', cost: [500, 1200, 2600], req: [null, { island: 'spring', rep: 6 }, { island: 'windmill', rep: 12 }], lvNames: ['帆布气囊', '加长气囊', '多环气囊', '巨型气囊'] },
  prop: { name: '螺旋桨', icon: '✣', desc: '最高航速与加速', cost: [450, 1100, 2400], req: [null, { island: 'workshop', rep: 6 }, { island: 'workshop', rep: 14 }], lvNames: ['三叶木桨', '加大木桨', '四叶桨', '四叶黄铜桨'] },
  hold: { name: '货舱', icon: '▣', desc: '货位与最大载重', cost: [400, 1000, 2200], req: [null, { island: 'port', rep: 6 }, { island: 'port', rep: 15 }], lvNames: ['标准货舱', '加宽货舱', '舷侧货架', '大型货运吊舱'] },
  armor: { name: '船体装甲', icon: '⛨', desc: '船体耐久、易碎品防护、抗颠簸', cost: [400, 1000, 2200], req: [null, { island: 'pine', rep: 5 }, { island: 'ember', rep: 10 }], lvNames: ['木质船体', '黄铜护板', '铆钉装甲', '全覆装甲'] },
}

/** 改装店：云港全价，工坊城 85 折 */
export const SHOP_DISCOUNT: Record<string, number> = { port: 1, workshop: 0.85, icehub: 1.1 }
export const hasShop = (island: string) => island in SHOP_DISCOUNT
export function partCost(part: Part, level: number, island: string) {
  if (level >= MAX_LEVEL) return 0
  return Math.round((PARTS[part].cost[level - 1] * (SHOP_DISCOUNT[island] ?? 1)) / 10) * 10
}
export const partReq = (part: Part, level: number): Req | null => (level >= MAX_LEVEL ? null : PARTS[part].req[level - 1])

/** 推进阻力（与 flight.ts PHYS 一致），用于估算最高航速 */
const LIN = 0.04, QUAD = 0.005
export const topSpeed = (thrust: number) => (-LIN + Math.sqrt(LIN * LIN + 4 * QUAD * thrust)) / (2 * QUAD)
const KN = 1.944

/** 某部件某级的属性描述（中文） */
export function partStats(part: Part, lv: number): [string, string][] {
  const i = lv - 1
  switch (part) {
    case 'boiler': return [['压力响应', `${Math.round(TABLE.boiler.pressRate[i] * 100)}%/秒`], ['燃煤消耗', `${Math.round(TABLE.boiler.coalMul[i] * 100)}%`]]
    case 'envelope': return [['基础浮力', `${TABLE.envelope.lift[i].toFixed(1)}`], ['每吨所需压力', `+${(TABLE.envelope.loadLift[i] * 100).toFixed(1)}%`], ['升限', `${TABLE.envelope.ceiling[i]} 米`]]
    case 'prop': return [['最高航速', `${(topSpeed(TABLE.prop.thrust[i]) * KN).toFixed(1)} 节`], ['桨速爬升', `${Math.round(TABLE.prop.propRate[i] * 100)}%/秒`]]
    case 'hold': return [['货位', `${TABLE.hold.slots[i]}`], ['最大载重', `${TABLE.hold.weight[i]} 吨`]]
    case 'armor': return [['船体耐久', `${TABLE.armor.hp[i]}`], ['易碎品受损', `${Math.round(TABLE.armor.fragile[i] * 100)}%`], ['抗颠簸', `${Math.round(TABLE.armor.bumpRes[i] * 100)}%`]]
  }
}

/** 船体倍率（hulls.ts 的子集，避免循环引用） */
export type HullMod = { thrust: number; turn: number; coal: number; hp: number; loadLift: number; baseNeed: number; ceiling: number; scale: number; dockDy: number; bigOnly: boolean; id: string }
const STD_HULL: HullMod = { thrust: 1, turn: 1, coal: 1, hp: 1, loadLift: 1, baseNeed: 0, ceiling: 0, scale: 1, dockDy: 0, bigOnly: false, id: 'standard' }
/** 飞行用的改装参数（v1.3：乘上船体倍率） */
export function shipMods(lv: Levels, h: HullMod = STD_HULL) {
  const g = (p: Part) => Math.max(0, Math.min(3, lv[p] - 1))
  return {
    pressRate: TABLE.boiler.pressRate[g('boiler')],
    coalMul: TABLE.boiler.coalMul[g('boiler')] * h.coal,
    lift: TABLE.envelope.lift[g('envelope')],
    loadLift: TABLE.envelope.loadLift[g('envelope')] * h.loadLift,
    ceiling: TABLE.envelope.ceiling[g('envelope')] + h.ceiling,
    thrust: TABLE.prop.thrust[g('prop')] * h.thrust,
    propRate: TABLE.prop.propRate[g('prop')],
    fragile: TABLE.armor.fragile[g('armor')],
    hpMax: Math.round(TABLE.armor.hp[g('armor')] * h.hp),
    bumpRes: TABLE.armor.bumpRes[g('armor')],
    turn: h.turn,
    baseNeed: h.baseNeed,
    scale: h.scale,
    dockDy: h.dockDy,
    bigOnly: h.bigOnly,
    hull: h.id,
  }
}
export type ShipMods = ReturnType<typeof shipMods>

// ---------------- 涂装 ----------------
export type Livery = {
  id: string
  name: string
  desc: string
  /** 气囊主色 / 蒙皮条 / 尾翼 / 吊舱木色 / 金属环 */
  canvas: string
  canvas2: string
  fin: string
  wood: string
  band: string
  unlock: { type: 'free' } | { type: 'buy'; cost: number } | { type: 'deliveries'; n: number } | { type: 'rep'; island: string; n: number } | { type: 'story'; ch: number } | { type: 'boss' } | { type: 'frost' }
}
export const LIVERIES: Livery[] = [
  { id: 'classic', name: '经典帆布', desc: '出厂时的米黄帆布与赭红尾翼', canvas: '#dcc49a', canvas2: '#c7a978', fin: '#a5503a', wood: '#6b4528', band: '#b8693a', unlock: { type: 'free' } },
  { id: 'navy', name: '海军蓝', desc: '藏青气囊配白色蒙皮条', canvas: '#3d5a80', canvas2: '#e8e2d0', fin: '#22334d', wood: '#4a3424', band: '#d6a54e', unlock: { type: 'free' } },
  { id: 'scarlet', name: '猩红信使', desc: '醒目的红白条纹，邮政飞艇的最爱', canvas: '#b8322a', canvas2: '#f0e6d2', fin: '#f0e6d2', wood: '#5a2e1e', band: '#e0b25a', unlock: { type: 'buy', cost: 300 } },
  { id: 'emerald', name: '翡翠果园', desc: '果园岛风格的绿与金', canvas: '#4f8a4a', canvas2: '#d9c36a', fin: '#2f5a2c', wood: '#5e4428', band: '#e0b25a', unlock: { type: 'deliveries', n: 10 } },
  { id: 'midnight', name: '午夜鎏金', desc: '黑色气囊与鎏金饰条，富商之选', canvas: '#26222a', canvas2: '#3b3440', fin: '#c9962e', wood: '#2e2420', band: '#f2cf7c', unlock: { type: 'buy', cost: 900 } },
  { id: 'glory', name: '云港荣耀', desc: '母港授予的白金礼服涂装', canvas: '#f2ede2', canvas2: '#d6b25e', fin: '#3b6fa0', wood: '#7a5634', band: '#f2cf7c', unlock: { type: 'rep', island: 'port', n: 15 } },
  { id: 'crow', name: '夜鸦', desc: '缴获自黑帆空贼的乌黑帆布与血红尾翼', canvas: '#1f1d22', canvas2: '#8a1f1a', fin: '#8a1f1a', wood: '#2a1e18', band: '#9a8a70', unlock: { type: 'story', ch: 4 } },
  { id: 'blacksail', name: '黑帆缴获', desc: '从黑帆号上缴获的猩红战帆与乌铁护板，特别篇奖励', canvas: '#141216', canvas2: '#a3241c', fin: '#d9c9a0', wood: '#1e1612', band: '#c23a2a', unlock: { type: 'boss' } },
  { id: 'aurora', name: '极光', desc: '霜原的极光织进气囊：墨蓝底色上流动的青绿光带，「霜原来信」终章奖励', canvas: '#1c2a4a', canvas2: '#3ee0b0', fin: '#a070e0', wood: '#2a3040', band: '#9ff0e0', unlock: { type: 'frost' } },
  { id: 'beacon', name: '灯塔金辉', desc: '纪念云港灯塔复明的金白涂装', canvas: '#f6e3a6', canvas2: '#fff6dc', fin: '#c98a1e', wood: '#6b4528', band: '#ffd76a', unlock: { type: 'story', ch: 6 } },
]
export const liveryOf = (id: string) => LIVERIES.find((l) => l.id === id) ?? LIVERIES[0]
