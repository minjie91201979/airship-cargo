/** 世界布局：浮空群岛、岛上建筑、栈桥与碰撞体。渲染与物理共用同一份数据。 */

/** 云海顶面高度 */
export const CLOUD_TOP = 18
/** 低于该高度给出低空警告 */
export const LOW_WARN = 48
/** 低于该高度视为沉入云海，倒计时后返回港口 */
export const SINK_Y = 20
/** 浮力升限（超过后浮力不足以继续上升） */
export const CEILING = 420
/** 航区边界：超过 WARN 给警告，超过 R 被气流推回 */
export const WORLD_WARN = 2150
export const WORLD_R = 2350

/**
 * v1.3 霜原群岛：位于云港群岛正北（+Z）的第二片群岛。
 * 两片群岛之间隔着一道强风墙（WALL）：只有在 WALL.alt 米以上的高空通道、且飞艇升限 ≥ WALL.ceil 才能穿越。
 * 航区 = 云港圆（WORLD_R）∪ 风墙走廊 ∪ 霜原圆（FROST）。
 */
export const FROST = { x: 0, z: 4150, r: 1250 }
export const WALL = { z0: 2450, z1: 2900, x: 1700, alt: 440, ceil: 500 }
export const CORRIDOR = { x: 1700, z0: 1500, z1: 3250 }
export type Region = 'main' | 'wall' | 'frost'
/** 某点所在区域 */
export function regionAt(x: number, z: number): Region {
  if (z >= WALL.z1) return 'frost'
  if (z > WALL.z0 && Math.abs(x) < WALL.x + 200) return 'wall'
  return 'main'
}
/** 霜原寒冷程度 0..1（风墙内渐变） */
export const frostK = (z: number) => Math.min(1, Math.max(0, (z - WALL.z0) / (WALL.z1 + 150 - WALL.z0)))
/** 距航区边界的越界量（≤0 在航区内）与推回方向中心 */
export function boundsCheck(x: number, z: number): { over: number; cx: number; cz: number } {
  const dm = Math.hypot(x, z) - WORLD_R
  const df = Math.hypot(x - FROST.x, z - FROST.z) - FROST.r
  const dc = Math.max(Math.abs(x) - CORRIDOR.x, CORRIDOR.z0 - z, z - CORRIDOR.z1)
  const over = Math.min(dm, df, dc)
  if (over === df) return { over, cx: FROST.x, cz: FROST.z }
  if (over === dc) return { over, cx: 0, cz: Math.min(CORRIDOR.z1, Math.max(CORRIDOR.z0, z)) }
  return { over, cx: 0, cz: 0 }
}

/** 岛上建筑 / 陈设（坐标相对岛中心，y=0 为岛顶面） */
export type Feature =
  | { k: 'warehouse' | 'house'; x: number; z: number; w: number; h: number; d: number; roof: string; wall: string }
  | { k: 'lighthouse'; x: number; z: number; h: number; r?: number }
  | { k: 'crane'; x: number; z: number; h: number }
  | { k: 'headframe'; x: number; z: number; h: number }
  | { k: 'heap'; x: number; z: number; r: number }
  | { k: 'chimney'; x: number; z: number; h: number }
  | { k: 'windmill'; x: number; z: number; h: number }
  | { k: 'watertower'; x: number; z: number; h: number }
  | { k: 'clocktower'; x: number; z: number; h: number }
  | { k: 'gear'; x: number; z: number; r: number }
  | { k: 'orchard'; x: number; z: number; w: number; d: number }
  | { k: 'pond'; x: number; z: number; r: number }
  | { k: 'waterfall'; a: number }
  | { k: 'ember'; x: number; z: number; r: number }
  | { k: 'reeds'; x: number; z: number; r: number }
  // v1.3 霜原
  | { k: 'crystal'; x: number; z: number; r: number }
  | { k: 'observatory'; x: number; z: number; h: number }
  | { k: 'hotspring'; x: number; z: number; r: number }
  | { k: 'watchtower'; x: number; z: number; h: number }
  | { k: 'pen'; x: number; z: number; r: number }

export type IslandDef = {
  id: string
  name: string
  /** 一句话简介（到达横幅） */
  desc: string
  x: number
  z: number
  /** 岛顶面高度 */
  top: number
  /** 顶面半径 */
  R: number
  /** 岩体下垂深度（锥尖在 top - depth） */
  depth: number
  seed: number
  /** 栈桥朝向（度，0 = +Z，只取 0/90/180/270） */
  pier: number
  features: Feature[]
  /** 随机树木数量与样式（0 松 1 阔叶 2 黄叶 3 枯树） */
  trees: { n: number; kinds: number[] }
  grass?: string
  rock?: string
  /** v1.3：所属群岛（默认云港群岛）、积雪、可停靠巨型运输舰的大型港口 */
  region?: 'main' | 'frost'
  snow?: boolean
  large?: boolean
}

const WH = (x: number, z: number, w: number, h: number, d: number, wall = '#9a4a32', roof = '#5f8f7a'): Feature => ({ k: 'warehouse', x, z, w, h, d, wall, roof })
const HS = (x: number, z: number, w: number, h: number, d: number, wall = '#9a5a3a', roof = '#5f8f7a'): Feature => ({ k: 'house', x, z, w, h, d, wall, roof })

export const PORT: IslandDef = {
  id: 'port', name: '云港', desc: '群岛航运的母港 · 补给与委托中心', x: 0, z: 0, top: 100, R: 60, depth: 80, seed: 7, pier: 0, large: true,
  features: [
    WH(-16, 30, 16, 10, 12), WH(18, 26, 12, 8, 14, '#8b5a3c', '#b9773d'), WH(-34, 2, 12, 9, 16, '#a3553a'),
    { k: 'lighthouse', x: -26, z: -34, h: 34 },
    { k: 'crane', x: 9, z: 47, h: 22 },
  ],
  trees: { n: 26, kinds: [0, 1, 2] },
}

const ISLANDS_MAIN: IslandDef[] = [
  PORT,
  {
    id: 'coal', name: '煤矿岛', desc: '黑烟缭绕的矿岛 · 群岛的燃煤产地', x: -950, z: 750, top: 135, R: 55, depth: 70, seed: 21, pier: 90, large: true,
    grass: '#7b8150', rock: '#6e5a50',
    features: [
      { k: 'headframe', x: -12, z: -8, h: 26 },
      { k: 'heap', x: -5, z: 22, r: 8 }, { k: 'heap', x: -28, z: 10, r: 6 }, { k: 'heap', x: 10, z: -28, r: 7 },
      { k: 'chimney', x: -30, z: -22, h: 24 },
      HS(18, 24, 10, 6, 8, '#5a4a40', '#3d3a3a'),
    ],
    trees: { n: 8, kinds: [0, 3] },
  },
  {
    id: 'orchard', name: '果园岛', desc: '阳光充足的果园 · 橙果与苹果飘香', x: 900, z: 950, top: 85, R: 52, depth: 60, seed: 34, pier: 270,
    grass: '#93b05a',
    features: [
      { k: 'orchard', x: 8, z: 0, w: 36, d: 40 },
      HS(-20, -28, 12, 9, 10, '#b0432f', '#6a4528'),
      { k: 'watertower', x: -24, z: 22, h: 12 },
    ],
    trees: { n: 6, kinds: [1, 2] },
  },
  {
    id: 'workshop', name: '工坊城', desc: '齿轮与蒸汽的城市 · 飞艇工匠聚集地', x: 1400, z: -450, top: 160, R: 72, depth: 95, seed: 55, pier: 270, large: true,
    grass: '#7f9152', rock: '#7d6656',
    features: [
      { k: 'clocktower', x: 0, z: 0, h: 36 },
      WH(22, -26, 16, 12, 14, '#8f4a32', '#b9773d'), WH(-20, -34, 14, 10, 12, '#a3553a'),
      HS(24, 20, 10, 8, 10, '#9a6a4a', '#5f8f7a'), HS(-22, 28, 12, 9, 9, '#a3553a', '#b9773d'), HS(42, 0, 9, 7, 14, '#8b5a3c', '#5f8f7a'),
      { k: 'chimney', x: 30, z: -46, h: 28 }, { k: 'chimney', x: 8, z: 42, h: 26 }, { k: 'chimney', x: -40, z: -14, h: 22 },
      { k: 'gear', x: 14, z: 8, r: 5 },
    ],
    trees: { n: 6, kinds: [1, 2] },
  },
  {
    id: 'beacon', name: '灯塔岛', desc: '群岛西陲的巨型灯塔 · 夜航者的指引', x: -1550, z: -850, top: 110, R: 34, depth: 55, seed: 89, pier: 90,
    features: [
      { k: 'lighthouse', x: -6, z: -4, h: 46, r: 4.4 },
      HS(10, -14, 7, 5, 6, '#e0d4bc', '#a8432f'),
    ],
    trees: { n: 4, kinds: [0, 1] },
  },
  {
    id: 'windmill', name: '风车岛', desc: '常年迎风的磨坊岛 · 风车日夜不停', x: -350, z: -1450, top: 140, R: 48, depth: 64, seed: 144, pier: 0,
    grass: '#a3b45e',
    features: [
      { k: 'windmill', x: -18, z: -10, h: 12 }, { k: 'windmill', x: 16, z: -18, h: 13 }, { k: 'windmill', x: 0, z: -34, h: 11 },
      HS(-20, 18, 9, 6, 8, '#d9c8a8', '#a8432f'),
    ],
    trees: { n: 10, kinds: [1, 2] },
  },
  {
    id: 'spring', name: '清泉岛', desc: '泉水从岛缘倾泻入云海 · 优质锅炉用水', x: -1750, z: 250, top: 175, R: 42, depth: 60, seed: 233, pier: 90,
    grass: '#6fa85a',
    features: [
      { k: 'watertower', x: -12, z: -14, h: 16 },
      { k: 'pond', x: -12, z: 12, r: 10 },
      { k: 'waterfall', a: 270 },
      HS(14, -20, 8, 6, 7, '#c9b08a', '#5f8f7a'),
    ],
    trees: { n: 12, kinds: [0, 1] },
  },
  {
    id: 'pine', name: '松风屿', desc: '高悬云端的松林小岛 · 猎人小屋', x: -600, z: 1700, top: 190, R: 40, depth: 60, seed: 377, pier: 180,
    features: [HS(4, 10, 7, 5, 6, '#7a5233', '#4f6a3e')],
    trees: { n: 24, kinds: [0] },
  },
  {
    id: 'ember', name: '余烬岛', desc: '地火未熄的焦岛 · 空气中弥漫硫磺味', x: 750, z: -1650, top: 120, R: 44, depth: 65, seed: 610, pier: 0,
    grass: '#5a4a44', rock: '#4a3b38',
    features: [
      { k: 'ember', x: -10, z: -6, r: 6 }, { k: 'ember', x: 14, z: -16, r: 4 }, { k: 'ember', x: -20, z: 14, r: 3.5 },
      HS(18, 10, 7, 5, 6, '#4a3b38', '#3d3a3a'),
    ],
    trees: { n: 6, kinds: [3] },
  },
  {
    id: 'reed', name: '芦苇礁', desc: '低垂的芦苇浅礁 · 渔人的高脚屋', x: 1800, z: 600, top: 70, R: 30, depth: 44, seed: 987, pier: 270,
    grass: '#a7a55a',
    features: [
      { k: 'reeds', x: -4, z: 10, r: 9 }, { k: 'reeds', x: 8, z: -10, r: 7 },
      HS(10, 8, 6, 4, 5, '#8f6038', '#a87a3a'),
    ],
    trees: { n: 3, kinds: [1] },
  },
]


/** v1.3 霜原群岛（6 座雪岛） */
const SNOW_ROOF = '#e8eef4'
export const FROST_ISLANDS: IslandDef[] = [
  {
    id: 'icehub', name: '冰港', desc: '霜原群岛的母港 · 改装、船坞与修理', x: 0, z: 3500, top: 150, R: 66, depth: 90, seed: 1597, pier: 180,
    region: 'frost', snow: true, large: true, grass: '#eef2f6', rock: '#7f8a98',
    features: [
      WH(-18, -26, 16, 10, 12, '#5a6a7a', SNOW_ROOF), WH(20, -24, 12, 9, 14, '#6a5a4a', SNOW_ROOF), WH(-36, 4, 12, 9, 16, '#4a5a6a', SNOW_ROOF),
      HS(28, 14, 10, 7, 9, '#8a5a3a', SNOW_ROOF),
      { k: 'crane', x: 10, z: -46, h: 22 },
      { k: 'chimney', x: -30, z: -40, h: 22 },
      { k: 'lighthouse', x: 30, z: 36, h: 28, r: 3.2 },
    ],
    trees: { n: 16, kinds: [4] },
  },
  {
    id: 'crystal', name: '冰晶矿', desc: '岩缝里长满发光的冰晶 · 极光晶石产地', x: -820, z: 3900, top: 175, R: 48, depth: 75, seed: 2584, pier: 90,
    region: 'frost', snow: true, grass: '#e4ecf2', rock: '#6a7484',
    features: [
      { k: 'crystal', x: -14, z: -12, r: 7 }, { k: 'crystal', x: 12, z: -22, r: 5 }, { k: 'crystal', x: -24, z: 16, r: 4.5 }, { k: 'crystal', x: 6, z: 20, r: 4 },
      { k: 'headframe', x: 18, z: -2, h: 20 },
      HS(-2, 32, 8, 5, 7, '#5a4a40', SNOW_ROOF),
    ],
    trees: { n: 5, kinds: [4] },
  },
  {
    id: 'reindeer', name: '驯鹿牧场', desc: '雪原上的驯鹿牧场 · 奶酪与毛毡', x: 760, z: 3780, top: 120, R: 54, depth: 64, seed: 4181, pier: 270,
    region: 'frost', snow: true, grass: '#eaf0ea', rock: '#7d8590',
    features: [
      { k: 'pen', x: 6, z: 4, r: 16 },
      HS(-26, -22, 12, 8, 10, '#9a4a32', SNOW_ROOF), WH(-26, 22, 12, 8, 10, '#7a5a3a', SNOW_ROOF),
      { k: 'watertower', x: 28, z: -24, h: 11 },
    ],
    trees: { n: 10, kinds: [4] },
  },
  {
    id: 'observatory', name: '观星台', desc: '霜原最高处的观星台 · 极光看得最清楚', x: -380, z: 4720, top: 235, R: 38, depth: 70, seed: 6765, pier: 90,
    region: 'frost', snow: true, grass: '#f0f4f8', rock: '#727c8c',
    features: [
      { k: 'observatory', x: -6, z: -4, h: 12 },
      HS(14, 16, 8, 5, 7, '#5a6a8a', SNOW_ROOF),
    ],
    trees: { n: 6, kinds: [4] },
  },
  {
    id: 'hotspring', name: '温泉谷', desc: '热气蒸腾的温泉谷 · 温泉蛋远近闻名', x: 680, z: 4560, top: 105, R: 46, depth: 60, seed: 10946, pier: 270,
    region: 'frost', snow: true, grass: '#dfe8e4', rock: '#7a7a84',
    features: [
      { k: 'hotspring', x: 4, z: -8, r: 10 }, { k: 'hotspring', x: -18, z: 16, r: 6 },
      HS(-22, -20, 10, 6, 8, '#8a4a3a', SNOW_ROOF), HS(22, 18, 8, 6, 7, '#7a5a3a', SNOW_ROOF),
    ],
    trees: { n: 8, kinds: [4] },
  },
  {
    id: 'watchtower', name: '北境哨塔', desc: '霜原北缘的孤塔 · 守望风雪的哨兵', x: 40, z: 5130, top: 205, R: 34, depth: 58, seed: 17711, pier: 180,
    region: 'frost', snow: true, grass: '#eef2f6', rock: '#68707e',
    features: [
      { k: 'watchtower', x: 0, z: 0, h: 26 },
      HS(-14, -16, 7, 5, 6, '#5a4a40', SNOW_ROOF),
    ],
    trees: { n: 7, kinds: [4] },
  },
]

/** 两片群岛的全部岛屿（渲染、碰撞、停靠共用） */
export const MAIN_ISLANDS = ISLANDS_MAIN
/** 全部岛屿（v1.3 起包含霜原群岛；只要云港群岛请用 MAIN_ISLANDS） */
export const ISLANDS: IslandDef[] = [...ISLANDS_MAIN, ...FROST_ISLANDS]
export const regionOfIsland = (isl: IslandDef | string) => (typeof isl === 'string' ? ISLANDS.find((i) => i.id === isl)?.region : isl.region) ?? 'main'
export const islandById = (id: string) => ISLANDS.find((i) => i.id === id)

/** 栈桥几何（相对岛中心，沿局部 +Z）：宽 7，从 R-10 伸出到 R+44 */
export const PIER_W = 7
export const pierZ0 = (isl: IslandDef) => isl.R - 10
export const pierZ1 = (isl: IslandDef) => isl.R + 44
export const PIER_DECK = 0.6

/** 局部坐标按栈桥朝向旋转到世界（与 three.js rotation.y 一致） */
export function rotY(lx: number, lz: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [lx * Math.cos(a) + lz * Math.sin(a), -lx * Math.sin(a) + lz * Math.cos(a)]
}

export type Dock = { island: IslandDef; x: number; y: number; z: number; yaw: number }
/** 每座岛的系泊点：栈桥侧面，船头朝外 */
export const DOCKS: Dock[] = ISLANDS.map((isl) => {
  const [dx, dz] = rotY(14, isl.R + 20, isl.pier)
  return { island: isl, x: isl.x + dx, y: isl.top + 11, z: isl.z + dz, yaw: (isl.pier * Math.PI) / 180 }
})
export const HOME_DOCK = DOCKS[0]

export type Box = { min: [number, number, number]; max: [number, number, number] }
export type Cyl = { x: number; z: number; r: number; y0: number; y1: number }

const BOXES_: Box[] = []
const CYLS_: Cyl[] = []
for (const isl of ISLANDS) {
  const T = isl.top
  // 栈桥（只取 90° 倍数，旋转后仍是轴对齐盒）
  const [ax, az] = rotY(-PIER_W / 2, pierZ0(isl), isl.pier)
  const [bx, bz] = rotY(PIER_W / 2, pierZ1(isl), isl.pier)
  BOXES_.push({ min: [isl.x + Math.min(ax, bx), T + PIER_DECK - 2.5, isl.z + Math.min(az, bz)], max: [isl.x + Math.max(ax, bx), T + PIER_DECK + 1.4, isl.z + Math.max(az, bz)] })
  for (const f of isl.features) {
    const cyl = (x: number, z: number, r: number, h: number) => CYLS_.push({ x: isl.x + x, z: isl.z + z, r, y0: T, y1: T + h })
    switch (f.k) {
      case 'warehouse': case 'house':
        BOXES_.push({ min: [isl.x + f.x - f.w / 2, T, isl.z + f.z - f.d / 2], max: [isl.x + f.x + f.w / 2, T + f.h + f.d * 0.45, isl.z + f.z + f.d / 2] })
        break
      case 'lighthouse': cyl(f.x, f.z, (f.r ?? 3.6) + 1, f.h + 4); break
      case 'crane': cyl(f.x, f.z, 2.2, f.h + 2); break
      case 'headframe': cyl(f.x, f.z, 3.5, f.h + 3); break
      case 'heap': cyl(f.x, f.z, f.r * 0.75, f.r * 0.9); break
      case 'chimney': cyl(f.x, f.z, 1.9, f.h); break
      case 'windmill': cyl(f.x, f.z, 4, f.h + 6); break
      case 'watertower': cyl(f.x, f.z, 3.6, f.h + 4); break
      case 'clocktower': cyl(f.x, f.z, 5.2, f.h + 6); break
      case 'gear': cyl(f.x, f.z, f.r, f.r * 2 + 1.5); break
      case 'crystal': cyl(f.x, f.z, f.r * 0.7, f.r * 2.4); break
      case 'observatory': cyl(f.x, f.z, 7, f.h + 7); break
      case 'watchtower': cyl(f.x, f.z, 4.2, f.h + 5); break
      default: break
    }
  }
}
export const BOXES = BOXES_
export const CYLS = CYLS_

/** 最近的岛（按到岛缘的水平距离） */
export function nearestIsland(x: number, z: number) {
  let best = ISLANDS[0], bd = Infinity
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z) - isl.R
    if (d < bd) { bd = d; best = isl }
  }
  return { island: best, dist: Math.max(0, bd) }
}
