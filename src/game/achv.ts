import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEco } from './economy'
import { onEvent } from './events'
import { fanfare } from './fanfare'
import { LIVERIES, MAX_LEVEL, PART_IDS } from './upgrades'
import { FROST_ISLANDS, MAIN_ISLANDS, regionOfIsland } from './world'

/**
 * 成就：独立于存档单独持久化（键 airship-cargo.achv.v1），开新航程不会清空。
 * 事件型计数记录在 life（终身累计），状态型成就直接读当前存档。
 */
export type Life = {
  deliveries: number; fragileGood: number; urgentOnTime: number; pirates: number; stormDel: number
  nightDel: number; fogDock: number; glideDock: number; maxCargo: number; chapters: number; ended: number
  kills: number; perfectEscort: number; bounties: number; boss: number; harpoonKill: number
  /** v1.3：停靠过霜原岛（位掩码）、冰鲜直送、跨区长途、巨舰单次交付件数、霜原篇完成 */
  frostMask: number; iceFresh: number; longHaul: number; giantBig: number; frostEnd: number
}
export const freshLife = (): Life => ({ deliveries: 0, fragileGood: 0, urgentOnTime: 0, pirates: 0, stormDel: 0, nightDel: 0, fogDock: 0, glideDock: 0, maxCargo: 0, chapters: 0, ended: 0, kills: 0, perfectEscort: 0, bounties: 0, boss: 0, harpoonKill: 0, frostMask: 0, iceFresh: 0, longHaul: 0, giantBig: 0, frostEnd: 0 })
const bits = (n: number) => { let c = 0; for (let i = 0; i < 16; i++) if (n & (1 << i)) c++; return c }

type Eco = ReturnType<typeof useEco.getState>
export type Achv = { id: string; icon: string; name: string; desc: string; prog: (l: Life, e: Eco) => [number, number]; fmt?: (a: number, b: number) => string }

const L = (k: keyof Life, n: number) => (l: Life): [number, number] => [Math.min(n, l[k]), n]
export const ACHVS: Achv[] = [
  { id: 'first', icon: '✉', name: '首航告捷', desc: '完成第一次货物交付', prog: L('deliveries', 1) },
  { id: 'del10', icon: '📦', name: '小有名气', desc: '累计交付 10 单', prog: L('deliveries', 10) },
  { id: 'del50', icon: '🏆', name: '群岛快递王', desc: '累计交付 50 单', prog: L('deliveries', 50) },
  { id: 'fragile10', icon: '🏺', name: '稳如磐石', desc: '易碎品以 95% 以上完好度送达 10 次', prog: L('fragileGood', 10) },
  { id: 'urgent5', icon: '⏱', name: '分秒必争', desc: '加急件准时送达 5 次', prog: L('urgentOnTime', 5) },
  { id: 'pirate1', icon: '☠', name: '虎口脱险', desc: '甩掉空贼的追击', prog: L('pirates', 1) },
  { id: 'pirate5', icon: '🏴', name: '黑帆克星', desc: '甩掉空贼 5 次', prog: L('pirates', 5) },
  { id: 'storm', icon: '⚡', name: '雷霆信使', desc: '穿越雷暴后把货物送达', prog: L('stormDel', 1) },
  { id: 'night3', icon: '🌙', name: '夜航人', desc: '夜间（19:30–5:00）完成 3 次交付', prog: L('nightDel', 3) },
  { id: 'fog', icon: '🌫', name: '雾中寻港', desc: '在浓雾中成功靠泊', prog: L('fogDock', 1) },
  { id: 'glide', icon: '🪶', name: '无煤滑翔', desc: '煤舱见底、锅炉熄火时滑翔靠港（不算拖航）', prog: L('glideDock', 1) },
  { id: 'fullhold', icon: '🧺', name: '满载而归', desc: '货舱里同时装着 8 件货物', prog: L('maxCargo', 8) },
  { id: 'rep', icon: '🏝', name: '群岛之友', desc: '云港群岛全部 10 座岛屿声望达到 10', prog: (_l, e) => [MAIN_ISLANDS.filter((i) => (e.rep[i.id] ?? 0) >= 10).length, MAIN_ISLANDS.length] },
  { id: 'part4', icon: '⚙', name: '精工细作', desc: '任意一个部件升到满级 Lv4', prog: (_l, e) => [Math.max(...PART_IDS.map((k) => e.parts[k])), MAX_LEVEL], fmt: (a, b) => `Lv${a}/${b}` },
  { id: 'allparts', icon: '🛠', name: '云端巨舰', desc: '五个部件全部升到 Lv4', prog: (_l, e) => [PART_IDS.filter((k) => e.parts[k] >= MAX_LEVEL).length, PART_IDS.length] },
  { id: 'liveries', icon: '🎨', name: '衣橱满满', desc: `收集全部 ${LIVERIES.length} 套涂装`, prog: (_l, e) => [e.liveries.length, LIVERIES.length] },
  { id: 'rich', icon: '💰', name: '腰缠万贯', desc: '同时持有 3000 银币', prog: (_l, e) => [Math.min(3000, e.money), 3000] },
  { id: 'dist', icon: '🧭', name: '万里云程', desc: '一局存档累计飞行 50 千米', prog: (_l, e) => [Math.min(50000, e.stats.distance), 50000], fmt: (a, b) => `${(a / 1000).toFixed(1)}/${b / 1000} 千米` },
  { id: 'ch1', icon: '📜', name: '新东家', desc: '完成主线第一章「旧船新主」', prog: L('chapters', 1) },
  { id: 'ending', icon: '🗼', name: '灯塔复明', desc: '完成主线终章，让云港灯塔重新亮起', prog: L('ended', 1) },
  // v1.2 战斗成就
  { id: 'kill1', icon: '⚔', name: '首战告捷', desc: '用武器击落第一艘空贼船', prog: L('kills', 1) },
  { id: 'kill10', icon: '🎯', name: '王牌炮手', desc: '累计击落 10 艘空贼船（含小艇）', prog: L('kills', 10) },
  { id: 'harpoon', icon: '🪝', name: '鱼叉猎手', desc: '击落一艘被鱼叉钩住的敌船', prog: L('harpoonKill', 1) },
  { id: 'escort', icon: '🛡', name: '完美护航', desc: '护航商船抵达目的地，且船体保持 90% 以上', prog: L('perfectEscort', 1) },
  { id: 'bounty3', icon: '📜', name: '赏金猎人', desc: '完成 3 次悬赏委托', prog: L('bounties', 3) },
  { id: 'boss', icon: '🏴', name: '黑帆落幕', desc: '击沉黑鸦的旗舰「黑帆号」', prog: L('boss', 1) },
  // v1.3 霜原成就
  { id: 'wall', icon: '🌬', name: '越过风墙', desc: '穿越强风墙，停靠任意一座霜原岛', prog: (l) => [Math.min(1, bits(l.frostMask)), 1] },
  { id: 'frost6', icon: '❄', name: '霜原行者', desc: '6 座霜原岛全部停靠过', prog: (l) => [bits(l.frostMask), FROST_ISLANDS.length] },
  { id: 'icefresh', icon: '🧊', name: '冰鲜直送', desc: '冰块以 80% 以上剩余量送达', prog: L('iceFresh', 1) },
  { id: 'long3', icon: '🛤', name: '跨区长途', desc: '完成 3 次跨区长途委托', prog: L('longHaul', 3) },
  { id: 'giant8', icon: '🛳', name: '巨舰船长', desc: '驾驶巨型运输舰一次交付 8 件以上货物', prog: (l) => [Math.min(8, l.giantBig), 8] },
  { id: 'aurora', icon: '🌌', name: '极光之下', desc: '完成霜原篇「霜原来信」', prog: L('frostEnd', 1) },
]

type State = { unlocked: Record<string, number>; life: Life }
export const useAchv = create<State>()(persist(() => ({ unlocked: {}, life: freshLife() }), {
  name: 'airship-cargo.achv.v1',
  version: 1,
  merge: (p, cur) => {
    const o = (p ?? {}) as Partial<State>
    return { ...cur, unlocked: o.unlocked ?? {}, life: { ...freshLife(), ...(o.life ?? {}) } }
  },
}))

const bump = (patch: Partial<Record<keyof Life, number>>) => {
  const l = { ...useAchv.getState().life }
  for (const [k, v] of Object.entries(patch)) l[k as keyof Life] += v as number
  useAchv.setState({ life: l })
}

onEvent((ev) => {
  if (ev.t === 'deliver') {
    const c = ev.c
    bump({
      deliveries: 1,
      fragileGood: c.kind === 'fragile' && c.condition >= 0.95 ? 1 : 0,
      urgentOnTime: c.kind === 'urgent' && ev.onTime ? 1 : 0,
      stormDel: (c.flags ?? []).includes('storm') ? 1 : 0,
      nightDel: ev.night ? 1 : 0,
      iceFresh: c.melt && c.condition >= 0.8 ? 1 : 0,
      longHaul: c.long || regionOfIsland(c.from) !== regionOfIsland(c.to) ? 1 : 0,
    })
  } else if (ev.t === 'dock' && !ev.tow) {
    bump({ fogDock: ev.fog > 0.35 ? 1 : 0, glideDock: ev.glide ? 1 : 0 })
    const fi = FROST_ISLANDS.findIndex((i) => i.id === ev.island)
    if (fi >= 0) useAchv.setState((s) => ({ life: { ...s.life, frostMask: s.life.frostMask | (1 << fi) } }))
  } else if (ev.t === 'pirateShaken') bump({ pirates: 1 })
  else if (ev.t === 'storyDone') useAchv.setState((s) => ({ life: { ...s.life, chapters: Math.max(s.life.chapters, ev.ch) } }))
  else if (ev.t === 'kill') bump({ kills: 1, harpoonKill: ev.harpooned ? 1 : 0, boss: ev.boss ? 1 : 0 })
  else if (ev.t === 'missionEnd' && ev.ok) {
    if (ev.m.mission === 'escort') bump({ perfectEscort: (ev.hp ?? 0) >= 90 ? 1 : 0 })
    if (ev.m.mission === 'bounty') bump({ bounties: 1 })
  }
  else if (ev.t === 'bigDelivery') useAchv.setState((s) => ({ life: { ...s.life, giantBig: Math.max(s.life.giantBig, ev.n) } }))
  else if (ev.t === 'frostDone') useAchv.setState((s) => ({ life: { ...s.life, frostEnd: 1 } }))
  else if (ev.t === 'ended') useAchv.setState((s) => ({ life: { ...s.life, ended: 1 } }))
  checkAchv()
})

export function checkAchv() {
  const e = useEco.getState()
  const st = useAchv.getState()
  if (e.started && e.cargo.length > st.life.maxCargo) { useAchv.setState({ life: { ...st.life, maxCargo: e.cargo.length } }); return checkAchv() }
  const fresh: Achv[] = []
  for (const a of ACHVS) {
    if (st.unlocked[a.id]) continue
    // 只在已开始的存档上判定（主菜单不会弹成就）
    const [c, m] = a.prog(st.life, e)
    if (c >= m && e.started) fresh.push(a)
  }
  if (!fresh.length) return
  const now = Date.now()
  useAchv.setState({ unlocked: { ...st.unlocked, ...Object.fromEntries(fresh.map((a) => [a.id, now])) } })
  for (const a of fresh) fanfare('achv', a.icon, '成就解锁', `「${a.name}」 · ${a.desc}`, 6000)
}

export const achvProgText = (a: Achv, l: Life, e: Eco) => {
  const [c, m] = a.prog(l, e)
  return a.fmt ? a.fmt(c, m) : `${Math.floor(c)}/${m}`
}

let t: ReturnType<typeof setTimeout> | null = null
useEco.subscribe(() => { if (!t) t = setTimeout(() => { t = null; checkAchv() }, 400) })
