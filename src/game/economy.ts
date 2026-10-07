import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DOCKS, ISLANDS, regionOfIsland, type Dock } from './world'
import { COLD_KIT_COST, HULLS, hasYard, hullHpMax, hullSlots, hullWeight, type HullId } from './hulls'
import { START_TOD, env } from './env'
import { emit, hooks, isNight } from './events'
import { DEFAULT_LEVELS, LIVERIES, MAX_LEVEL, PARTS, TABLE, liveryOf, partCost, partReq, type Levels, type Livery, type Part } from './upgrades'
import { FLARE_PRICE, NO_WEAPONS, WEAPONS, WEAPON_MAX, flareMax, hasArms, weaponCost, weaponReq, type WeaponId, type WeaponLevels } from './weapons'

/**
 * 经济与存档：银币、各岛声望、货舱、委托公告板、统计。
 * 持久化到 localStorage（键 airship-cargo.save.v1）。
 * 高频变化的游戏时钟 / 航程放在运行时对象 rt 中，每隔几秒同步进存档。
 */
export type Kind = 'normal' | 'fragile' | 'urgent' | 'heavy'
export const KIND_NAMES: Record<Kind, string> = { normal: '普通货', fragile: '易碎品', urgent: '加急件', heavy: '超重货' }
export const KIND_DESC: Record<Kind, string> = {
  normal: '无特殊要求',
  fragile: '碰撞与重着陆会损坏货物，按完好度结算',
  urgent: '限时送达，提前有奖励，超时减半，严重超时作废',
  heavy: '重量大，需要更高锅炉压力维持浮力',
}

export type Contract = {
  id: string
  from: string
  to: string
  goods: string
  kind: Kind
  /** 吨 */
  weight: number
  reward: number
  /** 两岛栈桥间直线距离（米） */
  dist: number
  /** 加急件：限时（秒）；其他：期望用时（秒，用于速度奖励） */
  limit: number
  /** 主线委托：对应的主线目标 id */
  story?: string
  /** 主线易碎品：要求的最低完好度 */
  minCond?: number
  /** v1.2 战斗委托：护航 / 悬赏 / 特别篇首领 */
  mission?: MissionKind
  /** 悬赏 / 首领：搜索区域 [x, z, 半径] */
  zone?: [number, number, number]
  /** 悬赏目标 / 护航商船名 */
  foe?: string
  /** v1.3 冰鲜货：会融化（condition 即剩余比例） */
  melt?: boolean
  /** v1.3 跨区长途委托 */
  long?: boolean
}
export type MissionKind = 'escort' | 'bounty' | 'boss'
export const MISSION_NAMES: Record<MissionKind, string> = { escort: '护航', bounty: '悬赏', boss: '特别篇' }
/** 进行中的战斗委托（同一时间只能接一个） */
export type Mission = Contract & { acceptedAt: number; npcHp: number }
export type Cargo = Contract & { acceptedAt: number; condition: number; flags?: string[] }

export type SettleRow = { goods: string; kind: Kind; from: string; base: number; bonus: number; damage: number; late: number; total: number; rep: number; note: string }
export type Settlement = { island: string; rows: SettleRow[]; total: number }

export const START_MONEY = 150
/** 公司欠云港商会的旧债 */
export const START_DEBT = 1200

/** 主线进度（随存档） */
export type StoryData = {
  /** 当前章节 1..6；7 = 主线已完成（自由航行） */
  ch: number
  /** 当前章节各目标的计数（事件型目标） */
  prog: Record<string, number>
  /** 剩余债务 */
  debt: number
  /** 是否已看过开场剧情 */
  intro: boolean
  /** 是否已看过结局 */
  ended: boolean
  /** 各章完成时的累计交付数（航运日志用） */
  done: Record<number, number>
  /** v1.3 霜原篇「霜原来信」：0 未解锁 · 1..3 进行中 · 4 完成 */
  fch: number
  /** 霜原篇当前章节的目标计数 */
  fprog: Record<string, number>
}
export const freshStory = (): StoryData => ({ ch: 1, prog: {}, debt: START_DEBT, intro: false, ended: false, done: {}, fch: 0, fprog: {} })
export const START_SLOTS = 4
export const START_WEIGHT = 10

/** 每座岛的出口货物 */
const EXPORTS: Record<string, { goods: string; kinds: Kind[]; w: [number, number]; melt?: boolean; vm?: number }[]> = {
  port: [{ goods: '邮件包裹', kinds: ['urgent', 'normal'], w: [0.4, 1.2] }, { goods: '日用杂货', kinds: ['normal'], w: [1, 3] }, { goods: '玻璃器皿', kinds: ['fragile'], w: [0.8, 1.6] }],
  coal: [{ goods: '煤炭', kinds: ['heavy', 'normal'], w: [3, 6] }, { goods: '铁矿石', kinds: ['heavy'], w: [4, 7] }],
  orchard: [{ goods: '鲜果', kinds: ['urgent', 'fragile'], w: [1, 2] }, { goods: '果酱罐', kinds: ['fragile', 'normal'], w: [0.8, 1.8] }],
  workshop: [{ goods: '机械零件', kinds: ['heavy', 'normal'], w: [2.5, 6] }, { goods: '精密仪表', kinds: ['fragile', 'urgent'], w: [0.5, 1.2] }],
  beacon: [{ goods: '灯油', kinds: ['urgent', 'normal'], w: [1, 2] }, { goods: '航海日志', kinds: ['urgent'], w: [0.3, 0.6] }],
  windmill: [{ goods: '面粉', kinds: ['normal', 'heavy'], w: [2, 4.5] }, { goods: '鸡蛋', kinds: ['fragile'], w: [0.6, 1.2] }],
  spring: [{ goods: '泉水桶', kinds: ['heavy', 'normal'], w: [3, 5.5] }, { goods: '药草', kinds: ['urgent'], w: [0.4, 1] }],
  pine: [{ goods: '松木', kinds: ['heavy'], w: [4, 6.5] }, { goods: '毛皮', kinds: ['normal'], w: [1, 2] }],
  ember: [{ goods: '硫磺', kinds: ['fragile', 'normal'], w: [1.5, 3] }, { goods: '火山玻璃', kinds: ['fragile'], w: [0.8, 1.5] }],
  reed: [{ goods: '鱼干', kinds: ['urgent', 'normal'], w: [0.8, 1.8] }, { goods: '芦苇席', kinds: ['normal'], w: [1, 2] }],
  // v1.3 霜原群岛
  icehub: [{ goods: '冰块', kinds: ['normal'], w: [1.5, 3], melt: true }, { goods: '腌鱼桶', kinds: ['normal', 'heavy'], w: [2, 4] }],
  crystal: [{ goods: '极光晶石', kinds: ['fragile'], w: [0.4, 1], vm: 1.8 }, { goods: '冰块', kinds: ['normal'], w: [2, 3.5], melt: true }],
  reindeer: [{ goods: '驯鹿奶酪', kinds: ['normal', 'urgent'], w: [0.8, 1.6] }, { goods: '鹿毛毡', kinds: ['normal'], w: [1, 2.2] }],
  observatory: [{ goods: '星图', kinds: ['urgent'], w: [0.2, 0.5] }, { goods: '镜片', kinds: ['fragile'], w: [0.4, 0.9] }],
  hotspring: [{ goods: '温泉蛋', kinds: ['urgent', 'fragile'], w: [0.5, 1.2] }, { goods: '矿盐', kinds: ['heavy'], w: [3, 5] }],
  watchtower: [{ goods: '哨塔信件', kinds: ['urgent'], w: [0.2, 0.5] }, { goods: '狼皮', kinds: ['normal'], w: [1, 2] }],
}
/** 跨区长途：云港群岛的长途货源（大港） */
const LONG_MAIN = ['port', 'workshop', 'coal']
const LONG_GOODS_OUT: Record<string, { goods: string; kind: Kind; w: [number, number] }[]> = {
  port: [{ goods: '越冬物资', kind: 'heavy', w: [3, 6] }, { goods: '商会邮袋', kind: 'urgent', w: [0.5, 1] }],
  workshop: [{ goods: '锅炉零件', kind: 'heavy', w: [3, 6] }, { goods: '精密罗盘', kind: 'fragile', w: [0.5, 1.2] }],
  coal: [{ goods: '优质无烟煤', kind: 'heavy', w: [4, 7] }],
}
export const KIND_MULT: Record<Kind, number> = { normal: 1, fragile: 1.4, urgent: 1.55, heavy: 1.3 }

/** 燃料价格（银币 / 每 1%） */
export const COAL_PRICE: Record<string, number> = { port: 0.9, coal: 0.35, orchard: 1.0, workshop: 0.75, beacon: 1.2, windmill: 1.0, spring: 1.0, pine: 1.1, ember: 1.3, reed: 1.4, icehub: 1.3, crystal: 1.5, reindeer: 1.4, observatory: 1.6, hotspring: 1.4, watchtower: 1.5 }
export const WATER_PRICE: Record<string, number> = { port: 0.4, coal: 0.6, orchard: 0.35, workshop: 0.45, beacon: 0.45, windmill: 0.35, spring: 0.1, pine: 0.3, ember: 0.8, reed: 0.25, icehub: 0.2, crystal: 0.2, reindeer: 0.2, observatory: 0.25, hotspring: 0.05, watchtower: 0.25 }

/** 黑帆锚地（特别篇首领战区域） */
export const BOSS_ZONE: [number, number, number] = [-150, -2050, 300]
const PIRATE_NAMES = ['「锈钩」莫三', '「赤鳍」柳娘', '「独眼」老坎', '「铁喙」包七', '「灰隼」阿蛮', '「疯鼓」赵六']
const NPC_NAMES = ['福顺号', '长风号', '白鹭号', '金穗号', '青雀号', '万里号']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export const islandName = (id: string) => ISLANDS.find((i) => i.id === id)?.name ?? id
export const dockOf = (id: string): Dock => DOCKS.find((d) => d.island.id === id) ?? DOCKS[0]

/** 运行时（高频）状态 */
export const rt = { clock: 0, distance: 0 }

let uid = 0
export function makeContract(fromId: string, rep: number, avoid: string[] = []): Contract {
  const ex = EXPORTS[fromId] ?? EXPORTS.port
  const e = ex[Math.floor(Math.random() * ex.length)]
  const kind = e.kinds[Math.floor(Math.random() * e.kinds.length)]
  // 目的地尽量不与公告板上已有委托重复；普通委托只在同一片群岛内（v1.3）
  const reg = regionOfIsland(fromId)
  const all = ISLANDS.filter((i) => i.id !== fromId && regionOfIsland(i.id) === reg)
  const pool = all.filter((i) => !avoid.includes(i.id))
  const others = pool.length ? pool : all
  const to = others[Math.floor(Math.random() * others.length)].id
  const a = dockOf(fromId), b = dockOf(to)
  const dist = Math.hypot(a.x - b.x, a.z - b.z)
  const weight = Math.round((e.w[0] + Math.random() * (e.w[1] - e.w[0])) * 10) / 10
  const reward = Math.round(((32 + dist * 0.065 + weight * 9) * KIND_MULT[kind] * (e.vm ?? 1) * (e.melt ? 1.25 : 1) * (1 + rep * 0.005)) / 5) * 5
  const limit = kind === 'urgent' ? Math.round(dist / 9.5 + 60) : Math.round(dist / 8.5 + 100)
  return { id: `c${Date.now().toString(36)}${(uid++).toString(36)}`, from: fromId, to, goods: e.goods, kind, weight, reward, dist, limit, melt: e.melt || undefined }
}

/** v1.3 跨区长途委托：云港群岛大港 ⇄ 霜原群岛 */
export function makeLongHaul(fromId: string, rep: number): Contract | null {
  const frost = ISLANDS.filter((i) => regionOfIsland(i.id) === 'frost').map((i) => i.id)
  let to: string, goods: string, kind: Kind, w: [number, number], melt = false
  if (regionOfIsland(fromId) === 'frost') {
    to = pick(LONG_MAIN)
    const ex = EXPORTS[fromId] ?? EXPORTS.icehub
    const e = pick(ex)
    goods = e.goods; kind = pick(e.kinds); w = e.w; melt = !!e.melt
  } else if (LONG_MAIN.includes(fromId)) {
    to = pick(frost)
    const e = pick(LONG_GOODS_OUT[fromId])
    goods = e.goods; kind = e.kind; w = e.w
  } else return null
  const a = dockOf(fromId), b = dockOf(to)
  const dist = Math.hypot(a.x - b.x, a.z - b.z)
  const weight = Math.round((w[0] + Math.random() * (w[1] - w[0])) * 10) / 10
  const reward = Math.round(((120 + dist * 0.11 + weight * 12) * KIND_MULT[kind] * (melt ? 1.3 : 1) * (1 + rep * 0.005)) / 5) * 5
  const limit = kind === 'urgent' ? Math.round(dist / 8.5 + 150) : Math.round(dist / 7 + 260)
  return { id: `L${Date.now().toString(36)}${(uid++).toString(36)}`, from: fromId, to, goods, kind, weight, reward, dist, limit, long: true, melt: melt || undefined }
}

/** 战斗委托：护航（商船从本岛飞往远岛）/ 悬赏（标记区域内的通缉空贼） */
export function makeMission(fromId: string, rep: number, kind: 'escort' | 'bounty'): Contract {
  const a = dockOf(fromId)
  const id = `m${Date.now().toString(36)}${(uid++).toString(36)}`
  const rk = 1 + rep * 0.005
  const MAIN = ISLANDS.filter((i) => regionOfIsland(i.id) === 'main')
  if (kind === 'escort') {
    const far = MAIN.filter((i) => i.id !== fromId && Math.hypot(dockOf(i.id).x - a.x, dockOf(i.id).z - a.z) > 900)
    const to = pick(far.length ? far : MAIN.filter((i) => i.id !== fromId)).id
    const b = dockOf(to)
    const dist = Math.hypot(a.x - b.x, a.z - b.z)
    const reward = Math.round(((150 + dist * 0.12) * rk) / 5) * 5
    const npc = pick(NPC_NAMES)
    return { id, from: fromId, to, goods: `护送商船「${npc}」`, kind: 'normal', weight: 0, reward, dist, limit: 0, mission: 'escort', foe: npc }
  }
  let zx = 0, zz = 0
  for (let t = 0; t < 40; t++) {
    const ang = Math.random() * Math.PI * 2, d = 700 + Math.random() * 800
    zx = a.x + Math.sin(ang) * d; zz = a.z + Math.cos(ang) * d
    if (Math.hypot(zx, zz) > 2000) continue
    if (ISLANDS.some((i) => Math.hypot(i.x - zx, i.z - zz) < 480)) continue
    break
  }
  const dist = Math.hypot(zx - a.x, zz - a.z)
  const foe = pick(PIRATE_NAMES)
  const reward = Math.round(((300 + dist * 0.08 + Math.random() * 60) * rk) / 5) * 5
  return { id, from: fromId, to: fromId, goods: `通缉空贼 ${foe}`, kind: 'normal', weight: 0, reward, dist, limit: 0, mission: 'bounty', zone: [Math.round(zx), Math.round(zz), 230], foe }
}
/** 特别篇「黑帆落幕」：云港公告板上的首领委托 */
export function bossMission(): Contract {
  const a = dockOf('port')
  return { id: 'boss-blacksail', from: 'port', to: 'port', goods: '击沉黑鸦的旗舰「黑帆号」', kind: 'normal', weight: 0, reward: 3000, dist: Math.hypot(BOSS_ZONE[0] - a.x, BOSS_ZONE[1] - a.z), limit: 0, mission: 'boss', zone: BOSS_ZONE, foe: '黑帆号' }
}

/** 主线委托 */
export function storyContract(story: string, from: string, to: string, goods: string, kind: Kind, weight: number, reward: number, minCond?: number, extra?: Partial<Contract>): Contract {
  const a = dockOf(from), b = dockOf(to)
  const dist = Math.hypot(a.x - b.x, a.z - b.z)
  const cross = regionOfIsland(from) !== regionOfIsland(to)
  const limit = kind === 'urgent' ? Math.round(dist / (cross ? 7 : 8) + (cross ? 200 : 90)) : Math.round(dist / 7.5 + 140)
  return { id: `story-${story}`, from, to, goods, kind, weight, reward, dist, limit, story, minCond, long: cross || undefined, ...extra }
}

type Data = {
  started: boolean
  money: number
  rep: Record<string, number>
  slots: number
  maxWeight: number
  cargo: Cargo[]
  boards: Record<string, Contract[]>
  boardAt: Record<string, number>
  clock: number
  lastDock: string
  coal: number
  water: number
  stats: { deliveries: number; failed: number; distance: number; earnings: number; spent: number }
  /** 改装等级 */
  parts: Levels
  /** 当前涂装 / 已拥有涂装 */
  livery: string
  liveries: string[]
  /** 船体耐久 */
  hp: number
  /** 时刻（0..24） */
  tod: number
  /** 主线 */
  story: StoryData
  /** v1.2 武器槽：各武器等级（0 = 未拥有）、照明弹弹药 */
  weapons: WeaponLevels
  flares: number
  /** 气囊破洞数（漏气，靠港修补） */
  holes: number
  /** 进行中的战斗委托 */
  mission: Mission | null
  /** 特别篇：0 未解锁 · 1 已解锁 · 2 已击沉黑帆号 */
  boss: number
  /** 战斗统计 */
  combat: { kills: number; bounties: number; escorts: number; bossKills: number }
  /** v1.3 当前船体 / 已拥有船体 / 防寒锅炉罩 */
  hull: HullId
  hulls: HullId[]
  coldKit: boolean
}
type State = Data & {
  settlement: Settlement | null
  notes: { id: number; text: string; bad?: boolean }[]
  newGame: () => void
  board: (islandId: string) => Contract[]
  accept: (islandId: string, id: string) => string | null
  abandon: (id: string) => void
  /** 抵达某岛：卸货结算、刷新公告板、记录停靠点 */
  arrive: (islandId: string) => Settlement | null
  closeSettlement: () => void
  pay: (amount: number) => number
  damageFragile: (amount: number) => void
  failExpired: () => void
  loseRisky: (reason: string) => number
  sync: (coal: number, water: number) => void
  note: (text: string, bad?: boolean) => void
  /** 改装：返回错误或 null */
  buyPart: (part: Part, island: string) => string | null
  /** 涂装：试穿预览（不存档） */
  previewLivery: string | null
  setPreview: (id: string | null) => void
  /** 使用 / 购买涂装：返回错误或 null */
  useLivery: (id: string) => string | null
  damageHull: (amount: number) => void
  repair: (island: string) => string | null
  /** 给货舱里所有货物打事件标记（storm / pirate） */
  flagCargo: (flag: string) => void
  /** 被空贼抢走 */
  steal: (id: string) => void
  /** 抛货 */
  jettison: (id: string) => void
  /** 偿还商会债务（仅云港）：返回错误或 null */
  payDebt: (amount: number) => string | null
  setStory: (patch: Partial<StoryData>) => void
  /** v1.2 武器 / 照明弹 / 修补气囊 / 战斗委托 */
  buyWeapon: (w: WeaponId, island: string) => string | null
  buyFlares: (island: string) => string | null
  patchHoles: (island: string) => string | null
  abandonMission: () => void
  /** 战斗委托结算：ok=false 为失败 */
  finishMission: (ok: boolean, pay: number, text: string) => void
  /** 清空存档（回到未开始状态） */
  wipe: () => void
  /** v1.3 船坞：预览（不存档）/ 购买 / 切换船体；防寒锅炉罩 */
  previewHull: HullId | null
  setPreviewHull: (h: HullId | null) => void
  buyHull: (h: HullId, island: string) => string | null
  switchHull: (h: HullId, island: string) => string | null
  buyColdKit: (island: string) => string | null
  /** 冰鲜货融化（每秒调用；rate = 每秒损失比例） */
  meltCargo: (rate: number) => void
}

const fresh = (): Data => ({
  started: false,
  money: START_MONEY,
  rep: Object.fromEntries(ISLANDS.map((i) => [i.id, 0])),
  slots: START_SLOTS,
  maxWeight: START_WEIGHT,
  cargo: [],
  boards: {},
  boardAt: {},
  clock: 0,
  lastDock: 'port',
  coal: 1,
  water: 1,
  stats: { deliveries: 0, failed: 0, distance: 0, earnings: 0, spent: 0 },
  parts: { ...DEFAULT_LEVELS },
  livery: 'classic',
  liveries: ['classic', 'navy'],
  hp: TABLE.armor.hp[0],
  tod: START_TOD,
  story: freshStory(),
  weapons: { ...NO_WEAPONS },
  flares: 0,
  holes: 0,
  mission: null,
  boss: 0,
  combat: { kills: 0, bounties: 0, escorts: 0, bossKills: 0 },
  hull: 'standard',
  hulls: ['standard'],
  coldKit: false,
})

let noteId = 0
export const useEco = create<State>()(persist((set, get) => ({
  ...fresh(),
  settlement: null,
  notes: [],
  previewLivery: null,
  previewHull: null,
  newGame: () => {
    rt.clock = 0
    rt.distance = 0
    set({ ...fresh(), started: true, settlement: null, notes: [] })
    emit({ t: 'newGame' })
  },
  board: (islandId) => {
    const s = get()
    const at = s.boardAt[islandId]
    let list = s.boards[islandId] ?? []
    const rep = s.rep[islandId] ?? 0
    if (at === undefined || rt.clock - at > 300) {
      const n = 3 + Math.floor(Math.random() * 3)
      list = []
      for (let i = 0; i < n; i++) list.push(makeContract(islandId, rep, list.map((c) => c.to)))
      // v1.2：交付 3 单以后，公告板有机会出现护航 / 悬赏委托
      const reg = regionOfIsland(islandId)
      if (reg === 'main' && s.stats.deliveries >= 3 && Math.random() < 0.6) list.push(makeMission(islandId, rep, Math.random() < 0.5 ? 'escort' : 'bounty'))
      // v1.3：跨区长途（霜原各岛总有一单；云港大港交付 6 单后约一半机会）
      if (reg === 'frost' || (s.stats.deliveries >= 6 && Math.random() < 0.5)) { const L = makeLongHaul(islandId, rep); if (L) list.push(L) }
      set({ boards: { ...s.boards, [islandId]: list }, boardAt: { ...s.boardAt, [islandId]: rt.clock } })
    } else if (list.length < 3) {
      list = [...list]
      while (list.length < 3) list.push(makeContract(islandId, rep, list.map((c) => c.to)))
      set({ boards: { ...s.boards, [islandId]: list } })
    }
    // 主线委托：相关时出现在公告板最上方
    // 特别篇首领委托：云港公告板置顶
    if (islandId === 'port' && s.boss === 1 && !list.some((c) => c.mission === 'boss') && s.mission?.mission !== 'boss') { list = [bossMission(), ...list]; set({ boards: { ...get().boards, [islandId]: list } }) }
    const story = hooks.storyContracts(islandId).filter((c) => !list.some((x) => x.id === c.id) && !get().cargo.some((x) => x.id === c.id))
    const stale = list.filter((c) => c.story && !hooks.storyContracts(islandId).some((x) => x.id === c.id))
    if (story.length || stale.length) {
      list = [...story, ...list.filter((c) => !stale.includes(c))]
      set({ boards: { ...get().boards, [islandId]: list } })
    }
    return list
  },
  accept: (islandId, id) => {
    const s = get()
    const c = (s.boards[islandId] ?? []).find((x) => x.id === id)
    if (!c) return '委托已失效'
    if (c.mission) {
      if (!hasArms(s.weapons)) return '需要武器（机炮或鱼叉）'
      if (s.mission) return '已有进行中的战斗委托'
      set({ mission: { ...c, acceptedAt: rt.clock, npcHp: 100 }, boards: { ...s.boards, [islandId]: s.boards[islandId].filter((x) => x.id !== id) } })
      emit({ t: 'mission', m: get().mission! })
      return null
    }
    const used = s.cargo.reduce((a, b) => a + b.weight, 0)
    if (s.cargo.length >= s.slots) return '货位已满'
    if (used + c.weight > s.maxWeight + 1e-6) return '超出货舱载重'
    set({
      cargo: [...s.cargo, { ...c, acceptedAt: rt.clock, condition: 1 }],
      boards: { ...s.boards, [islandId]: s.boards[islandId].filter((x) => x.id !== id) },
    })
    return null
  },
  abandon: (id) => {
    const s = get()
    const c = s.cargo.find((x) => x.id === id)
    if (!c) return
    set({ cargo: s.cargo.filter((x) => x.id !== id), rep: { ...s.rep, [c.from]: Math.max(0, (s.rep[c.from] ?? 0) - 3) }, stats: { ...s.stats, failed: s.stats.failed + 1 } })
    get().note(`已放弃委托：${c.goods}（${islandName(c.from)}声望 -3）`, true)
  },
  arrive: (islandId) => {
    const s = get()
    const due = s.cargo.filter((c) => c.to === islandId)
    let settlement: Settlement | null = null
    const rep = { ...s.rep }
    if (due.length) {
      const rows: SettleRow[] = due.map((c) => {
        const used = rt.clock - c.acceptedAt
        const base = c.reward
        let bonus = 0, late = 0, note = ''
        if (c.kind === 'urgent') {
          if (used <= c.limit) { bonus = Math.round(base * 0.25 * Math.min(1, ((c.limit - used) / c.limit) * 2)); note = '准时送达' }
          else { late = Math.round(base * 0.5); note = '超时送达' }
        } else if (used <= c.limit) { bonus = Math.round(base * 0.1); note = '快速送达' }
        const fl = c.flags ?? []
        if (fl.includes('storm')) {
          if (c.kind === 'urgent' && used <= c.limit) { bonus += Math.round(base * 0.1); note += ' · 冒雷暴抢送 +10%' }
          else note += ' · 穿越雷暴'
        }
        if (fl.includes('pirate')) { bonus += Math.round(base * 0.08); note += ' · 甩脱空贼 +8%' }
        const graded = c.kind === 'fragile' || c.melt
        const damage = graded ? Math.round(base * (1 - c.condition)) : 0
        if (c.melt) note += `${note ? ' · ' : ''}冰块剩余 ${Math.round(c.condition * 100)}%`
        else if (c.kind === 'fragile') note += `${note ? ' · ' : ''}完好度 ${Math.round(c.condition * 100)}%`
        if (c.long) note = `跨区长途 · ${note}`
        if (c.story) note = `主线 · ${note}`
        const total = Math.max(0, base + bonus - damage - late)
        const good = !late && c.condition > 0.9
        const r = 2 + (good ? 1 : 0) + (c.long ? 2 : 0)
        rep[c.to] = Math.min(100, (rep[c.to] ?? 0) + r)
        rep[c.from] = Math.min(100, (rep[c.from] ?? 0) + 1)
        return { goods: c.goods, kind: c.kind, from: c.from, base, bonus, damage, late, total, rep: r, note }
      })
      const total = rows.reduce((a, b) => a + b.total, 0)
      settlement = { island: islandId, rows, total }
      set({
        money: s.money + total,
        cargo: s.cargo.filter((c) => c.to !== islandId),
        rep,
        stats: { ...s.stats, deliveries: s.stats.deliveries + rows.length, earnings: s.stats.earnings + total },
        settlement,
      })
      const night = isNight(env.tod)
      due.forEach((c, i) => emit({ t: 'deliver', c, onTime: rt.clock - c.acceptedAt <= c.limit, night, total: rows[i].total }))
      if (s.hull === 'giant') emit({ t: 'bigDelivery', n: due.length, hull: s.hull })
    }
    set({ lastDock: islandId })
    get().board(islandId)
    return settlement
  },
  closeSettlement: () => set({ settlement: null }),
  pay: (amount) => {
    const s = get()
    const paid = Math.min(s.money, Math.max(0, Math.round(amount)))
    set({ money: s.money - paid, stats: { ...s.stats, spent: s.stats.spent + paid } })
    return paid
  },
  damageFragile: (amount) => {
    const s = get()
    if (!s.cargo.some((c) => c.kind === 'fragile')) return
    set({ cargo: s.cargo.map((c) => (c.kind === 'fragile' ? { ...c, condition: Math.max(0, c.condition - amount) } : c)) })
    get().note(`易碎货物受损！-${Math.round(amount * 100)}%`, true)
  },
  failExpired: () => {
    const s = get()
    const dead = s.cargo.filter((c) => c.kind === 'urgent' && rt.clock - c.acceptedAt > c.limit * 1.5)
    if (!dead.length) return
    const rep = { ...s.rep }
    for (const c of dead) rep[c.from] = Math.max(0, (rep[c.from] ?? 0) - 3)
    set({ cargo: s.cargo.filter((c) => !dead.includes(c)), rep, stats: { ...s.stats, failed: s.stats.failed + dead.length } })
    for (const c of dead) get().note(`加急件「${c.goods}」严重超时，委托作废（${islandName(c.from)}声望 -3）`, true)
  },
  loseRisky: (reason) => {
    const s = get()
    // 主线货物不会因拖航 / 坠海丢失（v1.1）
    const lost = s.cargo.filter((c) => !c.story && (c.kind === 'fragile' || c.kind === 'urgent'))
    if (!lost.length) return 0
    const rep = { ...s.rep }
    for (const c of lost) rep[c.from] = Math.max(0, (rep[c.from] ?? 0) - 3)
    set({ cargo: s.cargo.filter((c) => !lost.includes(c)), rep, stats: { ...s.stats, failed: s.stats.failed + lost.length } })
    get().note(`${reason}：损失 ${lost.length} 件易碎品 / 加急件`, true)
    return lost.length
  },
  sync: (coal, water) => {
    const s = get()
    set({ clock: rt.clock, coal, water, tod: env.tod, stats: { ...s.stats, distance: rt.distance } })
  },
  note: (text, bad) => {
    const id = ++noteId
    set((s) => ({ notes: [...s.notes.slice(-3), { id, text, bad }] }))
    setTimeout(() => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })), 5000)
  },
  buyPart: (part, island) => {
    const s = get()
    const lv = s.parts[part]
    if (lv >= MAX_LEVEL) return '已满级'
    const req = partReq(part, lv)
    if (req && (s.rep[req.island] ?? 0) < req.rep) return `需要${islandName(req.island)}声望 ${req.rep}`
    const cost = partCost(part, lv, island)
    if (s.money < cost) return '银币不足'
    const parts = { ...s.parts, [part]: lv + 1 }
    const patch: Partial<Data> = { parts, money: s.money - cost, stats: { ...s.stats, spent: s.stats.spent + cost } }
    if (part === 'hold') { patch.slots = hullSlots(s.hull, lv + 1); patch.maxWeight = hullWeight(s.hull, lv + 1) }
    if (part === 'armor') patch.hp = Math.min(hullHpMax(s.hull, lv + 1), s.hp + (hullHpMax(s.hull, lv + 1) - hullHpMax(s.hull, lv)))
    set(patch)
    get().note(`改装完成：${PARTS[part].name} → Lv${lv + 1}「${PARTS[part].lvNames[lv]}」（-${cost} 银币）`)
    return null
  },
  setPreview: (id) => set({ previewLivery: id }),
  useLivery: (id) => {
    const s = get()
    const l = liveryOf(id)
    if (!s.liveries.includes(id)) {
      const st = liveryState(l, s)
      if (!st.ok) return st.text
      if (l.unlock.type === 'buy') {
        if (s.money < l.unlock.cost) return '银币不足'
        set({ money: s.money - l.unlock.cost, stats: { ...s.stats, spent: s.stats.spent + l.unlock.cost } })
      }
      set({ liveries: [...get().liveries, id] })
    }
    set({ livery: id, previewLivery: null })
    get().note(`已换上涂装「${l.name}」`)
    return null
  },
  flagCargo: (flag) => {
    const s = get()
    if (!s.cargo.some((c) => !(c.flags ?? []).includes(flag))) return
    set({ cargo: s.cargo.map((c) => ((c.flags ?? []).includes(flag) ? c : { ...c, flags: [...(c.flags ?? []), flag] })) })
  },
  steal: (id) => {
    const s = get()
    const c = s.cargo.find((x) => x.id === id)
    if (!c) return
    set({ cargo: s.cargo.filter((x) => x.id !== id), rep: { ...s.rep, [c.from]: Math.max(0, (s.rep[c.from] ?? 0) - 2) }, stats: { ...s.stats, failed: s.stats.failed + 1 } })
  },
  jettison: (id) => {
    const s = get()
    const c = s.cargo.find((x) => x.id === id)
    if (!c) return
    set({ cargo: s.cargo.filter((x) => x.id !== id), rep: { ...s.rep, [c.from]: Math.max(0, (s.rep[c.from] ?? 0) - 2) }, stats: { ...s.stats, failed: s.stats.failed + 1 } })
  },
  payDebt: (amount) => {
    const s = get()
    if (s.story.debt <= 0) return '债务已还清'
    const n = Math.min(s.story.debt, Math.floor(amount), s.money)
    if (n <= 0) return '银币不足'
    set({ money: s.money - n, story: { ...s.story, debt: s.story.debt - n }, stats: { ...s.stats, spent: s.stats.spent + n } })
    get().note(s.story.debt - n <= 0 ? `向云港商会还清了全部旧债！（-${n} 银币）` : `向云港商会还款 ${n} 银币，剩余债务 ${s.story.debt - n}`)
    return null
  },
  setStory: (patch) => set((s) => ({ story: { ...s.story, ...patch } })),
  buyWeapon: (w, island) => {
    const s = get()
    const lv = s.weapons[w] ?? 0
    if (lv >= WEAPON_MAX) return '已满级'
    const req = weaponReq(w, lv)
    if (req && (s.rep[req.island] ?? 0) < req.rep) return `需要${islandName(req.island)}声望 ${req.rep}`
    const cost = weaponCost(w, lv, island)
    if (s.money < cost) return '银币不足'
    const weapons = { ...s.weapons, [w]: lv + 1 }
    set({ weapons, money: s.money - cost, flares: w === 'flare' ? flareMax(weapons) : s.flares, stats: { ...s.stats, spent: s.stats.spent + cost } })
    get().note(`${lv ? '武器升级' : '购入武器'}：${WEAPONS[w].name} → Lv${lv + 1}「${WEAPONS[w].lvNames[lv]}」（-${cost} 银币）`)
    return null
  },
  buyFlares: (island) => {
    void island
    const s = get()
    const max = flareMax(s.weapons)
    const need = max - s.flares
    if (max <= 0) return '没有照明弹发射器'
    if (need <= 0) return '照明弹已满'
    const n = Math.min(need, Math.floor(s.money / FLARE_PRICE))
    if (n <= 0) return '银币不足'
    set({ flares: s.flares + n, money: s.money - n * FLARE_PRICE, stats: { ...s.stats, spent: s.stats.spent + n * FLARE_PRICE } })
    get().note(`补充照明弹 ${n} 发（-${n * FLARE_PRICE} 银币）`)
    return null
  },
  patchHoles: (island) => {
    const s = get()
    if (s.holes <= 0) return '气囊完好'
    const price = Math.round(35 * (REPAIR_PRICE[island] ?? 1.5))
    const n = Math.min(s.holes, Math.floor(s.money / price))
    if (n <= 0) return '银币不足'
    set({ holes: s.holes - n, money: s.money - n * price, stats: { ...s.stats, spent: s.stats.spent + n * price } })
    get().note(`修补气囊破洞 ${n} 处（-${n * price} 银币）`)
    return null
  },
  abandonMission: () => {
    const s = get()
    const m = s.mission
    if (!m) return
    const rep = { ...s.rep }
    if (m.mission !== 'boss') rep[m.from] = Math.max(0, (rep[m.from] ?? 0) - 2)
    set({ mission: null, rep })
    emit({ t: 'missionEnd', m, ok: false })
    get().note(`已放弃${MISSION_NAMES[m.mission!]}委托${m.mission !== 'boss' ? `（${islandName(m.from)}声望 -2）` : ''}`, true)
  },
  finishMission: (ok, pay, text) => {
    const s = get()
    const m = s.mission
    if (!m) return
    const rep = { ...s.rep }
    const cb = { ...s.combat }
    if (ok) {
      rep[m.from] = Math.min(100, (rep[m.from] ?? 0) + (m.mission === 'escort' ? 3 : 2))
      if (m.mission === 'escort') { rep[m.to] = Math.min(100, (rep[m.to] ?? 0) + 2); cb.escorts++ }
      if (m.mission === 'bounty') cb.bounties++
    } else if (m.mission !== 'boss') rep[m.from] = Math.max(0, (rep[m.from] ?? 0) - 3)
    set({ mission: null, rep, combat: cb, money: s.money + pay, stats: { ...s.stats, earnings: s.stats.earnings + pay, failed: s.stats.failed + (ok ? 0 : 1) } })
    get().note(text, !ok)
    emit({ t: 'missionEnd', m, ok, hp: m.npcHp })
  },
  wipe: () => { rt.clock = 0; rt.distance = 0; env.tod = START_TOD; set({ ...fresh(), started: false, settlement: null, notes: [] }) },
  damageHull: (amount) => set((s) => ({ hp: Math.max(0, s.hp - amount) })),
  setPreviewHull: (h) => set({ previewHull: h }),
  buyHull: (h, island) => {
    const s = get()
    if (!hasYard(island)) return '这里没有船坞'
    if (s.hulls.includes(h)) return get().switchHull(h, island)
    const H = HULLS[h]
    if (s.money < H.cost) return '银币不足'
    set({ money: s.money - H.cost, hulls: [...s.hulls, h], stats: { ...s.stats, spent: s.stats.spent + H.cost } })
    get().note(`船坞：购入${H.name}（-${H.cost} 银币）`)
    const err = get().switchHull(h, island)
    if (err) get().note(`${H.name}已停在船坞：${err}`, true)
    return null
  },
  switchHull: (h, island) => {
    const s = get()
    if (!hasYard(island)) return '这里没有船坞'
    if (!s.hulls.includes(h)) return '尚未拥有该船体'
    if (s.hull === h) return '正在使用该船体'
    const slots = hullSlots(h, s.parts.hold), maxWeight = hullWeight(h, s.parts.hold)
    const used = cargoWeight(s.cargo)
    if (s.cargo.length > slots) return `货舱里有 ${s.cargo.length} 件货，${HULLS[h].name}只有 ${slots} 个货位`
    if (used > maxWeight + 1e-6) return `货物 ${used.toFixed(1)} 吨超出${HULLS[h].name}载重 ${maxWeight} 吨`
    const ratio = s.hp / Math.max(1, hullHpMax(s.hull, s.parts.armor))
    set({ hull: h, slots, maxWeight, hp: Math.round(hullHpMax(h, s.parts.armor) * ratio), previewHull: null })
    get().note(`已换乘${HULLS[h].name}${HULLS[h].bigOnly ? ' · 注意：只能停靠大型港口' : ''}`)
    return null
  },
  buyColdKit: (island) => {
    void island
    const s = get()
    if (s.coldKit) return '已安装'
    if (s.money < COLD_KIT_COST) return '银币不足'
    set({ coldKit: true, money: s.money - COLD_KIT_COST, stats: { ...s.stats, spent: s.stats.spent + COLD_KIT_COST } })
    get().note(`安装防寒锅炉罩：霜原耗煤加成降到 +8%（-${COLD_KIT_COST} 银币）`)
    return null
  },
  meltCargo: (rate) => {
    const s = get()
    if (!s.cargo.some((c) => c.melt)) return
    set({ cargo: s.cargo.map((c) => (c.melt ? { ...c, condition: Math.max(0, c.condition - rate) } : c)) })
  },
  repair: (island) => {
    const s = get()
    const max = hullHpMax(s.hull, s.parts.armor)
    const need = max - s.hp
    if (need < 0.5) return '船体完好'
    const price = REPAIR_PRICE[island] ?? 1.5
    const n = Math.min(need, s.money / price)
    if (n < 0.5) return '银币不足'
    const cost = Math.ceil(n * price)
    set({ hp: Math.min(max, s.hp + n), money: Math.max(0, s.money - cost), stats: { ...s.stats, spent: s.stats.spent + cost } })
    get().note(`修理船体 +${Math.round(n)}（-${cost} 银币）`)
    return null
  },
}), {
  name: 'airship-cargo.save.v1',
  version: 6,
  // v1（0.3.0-m2）存档：补上改装、涂装与船体耐久
  migrate: (old, version) => {
    const o = (old ?? {}) as Partial<Data>
    if (version < 2) {
      o.parts = { ...DEFAULT_LEVELS }
      o.livery = 'classic'
      o.liveries = ['classic', 'navy']
      o.hp = TABLE.armor.hp[0]
      o.slots = TABLE.hold.slots[0]
      o.maxWeight = TABLE.hold.weight[0]
    }
    // v2（0.4.0-m3）→ v3：加入时刻
    if (version < 3) o.tod = START_TOD
    // v3（0.5.0-m4）→ v4：加入主线进度（从第一章开始，继续时播放开场剧情）
    if (version < 4) o.story = freshStory()
    // v4（1.1.x）→ v5（1.2.0）：加入武器槽、照明弹、气囊破洞、战斗委托与特别篇进度（原有进度全部保留）
    if (version < 5) {
      o.weapons = { ...NO_WEAPONS }
      o.flares = 0
      o.holes = 0
      o.mission = null
      o.boss = 0
      o.combat = { kills: 0, bounties: 0, escorts: 0, bossKills: 0 }
    }
    // v5（1.2.x）→ v6（1.3.0）：加入船体、防寒锅炉罩与霜原篇进度（原有进度全部保留，船体为标准货船）
    if (version < 6) {
      o.hull = 'standard'
      o.hulls = ['standard']
      o.coldKit = false
      if (o.story) o.story = { ...o.story, fch: 0, fprog: {} }
    }
    return o as unknown as State
  },
  partialize: (s) => {
    const { settlement: _s, notes: _n, previewLivery: _p, previewHull: _h, ...rest } = s
    void _s; void _n; void _p; void _h
    return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== 'function')) as unknown as State
  },
  onRehydrateStorage: () => (st) => {
    if (st) { rt.clock = st.clock; rt.distance = st.stats.distance; env.tod = st.tod ?? START_TOD; if (!st.story) st.story = freshStory(); if (st.story.debt > START_DEBT) st.story = { ...st.story, debt: START_DEBT }
      if (!st.weapons) st.weapons = { ...NO_WEAPONS }
      if (!st.combat) st.combat = { kills: 0, bounties: 0, escorts: 0, bossKills: 0 }
      st.flares ??= 0; st.holes ??= 0; st.boss ??= 0; st.mission ??= null
      st.hull ??= 'standard'; st.hulls ??= ['standard']; st.coldKit ??= false
      if (st.story.fch === undefined) st.story = { ...st.story, fch: 0, fprog: {} }
      for (const i of ISLANDS) st.rep[i.id] ??= 0 }
  },
}))

export const cargoWeight = (cargo: Cargo[]) => cargo.reduce((a, b) => a + b.weight, 0)

/** 补给：按价格购买燃料，钱不够就买得起多少买多少。返回实际购买比例 */
export function buyFuel(islandId: string, kind: 'coal' | 'water', current: number): { amount: number; cost: number } {
  const price = (kind === 'coal' ? COAL_PRICE : WATER_PRICE)[islandId] ?? 1
  const need = Math.max(0, 1 - current)
  const s = useEco.getState()
  const affordable = price > 0 ? s.money / (price * 100) : need
  const amount = Math.min(need, affordable)
  const cost = Math.ceil(amount * 100 * price)
  if (amount <= 0.001) return { amount: 0, cost: 0 }
  useEco.getState().pay(cost)
  return { amount, cost }
}

/** 修理价格（银币 / 每点耐久） */
export const REPAIR_PRICE: Record<string, number> = { port: 1.2, workshop: 0.8, icehub: 1.3 }

/** 涂装是否可用 / 解锁说明 */
export function liveryState(l: Livery, s: { liveries: string[]; stats: { deliveries: number }; rep: Record<string, number> }): { ok: boolean; owned: boolean; text: string } {
  const owned = s.liveries.includes(l.id)
  if (owned) return { ok: true, owned, text: '已拥有' }
  const u = l.unlock
  if (u.type === 'free') return { ok: true, owned, text: '免费' }
  if (u.type === 'buy') return { ok: true, owned, text: `${u.cost} 银币` }
  if (u.type === 'frost') return { ok: false, owned, text: '霜原篇「霜原来信」终章奖励' }
  if (u.type === 'boss') return { ok: false, owned, text: '特别篇「黑帆落幕」奖励' }
  if (u.type === 'story') return { ok: false, owned, text: `主线第${'一二三四五六'[u.ch - 1]}章奖励` }
  if (u.type === 'deliveries') return s.stats.deliveries >= u.n ? { ok: true, owned, text: '已解锁' } : { ok: false, owned, text: `累计交付 ${u.n} 单解锁（${s.stats.deliveries}/${u.n}）` }
  return (s.rep[u.island] ?? 0) >= u.n ? { ok: true, owned, text: '已解锁' } : { ok: false, owned, text: `${islandName(u.island)}声望 ${u.n} 解锁（${s.rep[u.island] ?? 0}/${u.n}）` }
}
export { LIVERIES }
