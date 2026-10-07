/**
 * 云港航运 · 平衡性模拟（无界面，tsx 运行）：npm run sim
 * 模拟一名「普通玩家」完整通关主线：
 * - 贪心接单：每到一港，对每个候选目的地估算（报酬 + 主线目标价值）/ 航行用时，取最优；
 * - 航行用时 = 距离 / (巡航空速 × 新手效率 + 顺风分量) + 起降靠泊开销；风取真实风场（建议高度），
 * - 燃料按真实耗煤 / 耗水公式与各岛价格结算；船体磨损、雷暴、空贼、浓雾、夜间按概率或真实函数模拟；
 * - 有钱就按优先级改装，第五章在云港还债。
 * 输出每章用时、银币曲线与关键统计。参数：SEEDS=次数（默认 200）、ASSIST=0 关闭航线辅助。
 */
import { CHAPTERS, type Objective } from '../src/game/story'
import { COAL_PRICE, WATER_PRICE, START_MONEY, START_DEBT, REPAIR_PRICE, makeContract, dockOf, storyContract, islandName, type Contract } from '../src/game/economy'
import { PARTS, TABLE, partCost, partReq, topSpeed, type Part, type Levels } from '../src/game/upgrades'
import { MAIN_ISLANDS as ISLANDS } from '../src/game/world'
import { FUEL, coalRate, waterRate } from '../src/game/fuel'
import { windAt } from '../src/game/wind'
import { fogAt, HOURS_PER_SEC, START_TOD } from '../src/game/env'
import { isNight } from '../src/game/events'

const SEEDS = Number(process.env.SEEDS ?? 200)
const ASSIST = process.env.ASSIST !== '0'
const VERBOSE = process.env.VERBOSE === '1'
/** 新手效率：实际平均速度 / 理论巡航速度 */
const EFF = Number(process.env.EFF ?? 0.8)
/** 每段航程的起飞、爬升、进近与靠泊开销（秒） */
const LEG_OVERHEAD = Number(process.env.OVERHEAD ?? 45)
/** 每次停港操作（看板、补给、结算）耗时（秒） */
const PORT_DWELL = Number(process.env.DWELL ?? 30)
/** 读剧情卡片 */
const CARD_TIME = 35

let rnd = Math.random
function seeded(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }

type Cargo = Contract & { condition: number; acceptedAt: number; flags: string[] }
type S = {
  t: number; tod: number; money: number; rep: Record<string, number>; parts: Levels; slots: number; maxW: number
  hp: number; coal: number; water: number; at: string; cargo: Cargo[]; boards: Record<string, { at: number; list: Contract[] }>
  ch: number; prog: Record<string, number>; debt: number; deliveries: number; earned: number; spentFuel: number; spentParts: number; spentRepair: number; tows: number; reliefs: number; lost: number; holes: number; shotDmg: number
  chT: number[]; objT: Record<string, number>; moneyAt: { t: number; m: number }[]; legs: number
}

const objs = (s: S) => CHAPTERS[s.ch - 1]?.objs ?? []
function prog(o: Objective, s: S): [number, number] {
  const p = s.prog
  switch (o.type) {
    case 'deliver': case 'fragileGood': case 'stormDeliver': case 'nightDeliver': case 'pirate': case 'fogDock': return [Math.min(o.n, p[o.id] ?? 0), o.n]
    case 'story': return [p[o.id] ? 1 : 0, 1]
    case 'partLv': return [Math.max(...Object.values(s.parts)) >= o.lv ? 1 : 0, 1]
    case 'rep': return [Math.min(o.n, s.rep[o.island] ?? 0), o.n]
    case 'visit': return [o.islands.filter((i) => p[`${o.id}:${i}`]).length, o.islands.length]
    case 'debt': return [s.debt <= 0 ? 1 : 0, 1]
    case 'total': return [Math.min(o.n, s.deliveries), o.n]
  }
}
const done = (o: Objective, s: S) => { const [a, b] = prog(o, s); return a >= b }
const need = (s: S, type: Objective['type']) => objs(s).find((o) => o.type === type && !done(o, s))

function mods(s: S) {
  const g = (p: Part) => s.parts[p] - 1
  return { thrust: TABLE.prop.thrust[g('prop')], coalMul: TABLE.boiler.coalMul[g('boiler')], loadLift: TABLE.envelope.loadLift[g('envelope')], fragile: TABLE.armor.fragile[g('armor')], hpMax: TABLE.armor.hp[g('armor')], bumpRes: TABLE.armor.bumpRes[g('armor')], ceiling: TABLE.envelope.ceiling[g('envelope')] }
}
const load = (c: Cargo[]) => c.reduce((a, b) => a + b.weight, 0)

/** 航程估算：返回飞行秒数与平均顺风分量 */
function legTime(s: S, from: string, to: string, w: number) {
  const a = dockOf(from), b = dockOf(to)
  const dist = Math.hypot(a.x - b.x, a.z - b.z)
  const m = mods(s)
  const v = topSpeed(m.thrust * 0.75 * (1 - w * 0.012)) * EFF
  const dx = (b.x - a.x) / dist, dz = (b.z - a.z) / dist
  const tailAt = (alt: number) => { let sum = 0; for (let i = 0; i < 8; i++) { const f = (i + 0.5) / 8; const ws = windAt(a.x + dx * dist * f, alt, a.z + dz * dist * f, s.t); sum += ws.x * dx + ws.z * dz } return sum / 8 }
  let tail: number
  if (ASSIST) {
    let best = Infinity; tail = 0
    for (let alt = 80; alt <= Math.min(m.ceiling - 25, 450); alt += 20) {
      const tl = tailAt(alt), c = dist / Math.max(3, v + tl) + (Math.abs(alt - a.y) + Math.abs(alt - b.y)) / 2.4
      if (c < best) { best = c; tail = tl }
    }
  } else tail = tailAt(Math.max(a.y, b.y) + 20 + rnd() * 80)
  return { dist, fly: dist / Math.max(3, v + tail) + LEG_OVERHEAD, tail }
}

function board(s: S, isl: string): Contract[] {
  const b = s.boards[isl]
  if (!b || s.t - b.at > 300) {
    const n = 3 + Math.floor(rnd() * 3)
    const list: Contract[] = []
    for (let i = 0; i < n; i++) list.push(makeContract(isl, s.rep[isl] ?? 0, list.map((c) => c.to)))
    s.boards[isl] = { at: s.t, list }
  }
  const list = s.boards[isl].list
  while (list.length < 3) list.push(makeContract(isl, s.rep[isl] ?? 0, list.map((c) => c.to)))
  const story = objs(s).flatMap((o) => (o.type === 'story' && o.from === isl && !s.prog[o.id] && !s.cargo.some((c) => c.id === `story-${o.id}`) ? [storyContract(o.id, o.from, o.to, o.goods, o.kind, o.weight, o.reward, o.minCond)] : []))
  return [...story, ...list]
}

/** 主线目标给某单 / 某目的地的「虚拟价值」 */
function objValue(s: S, c: Contract | null, to: string) {
  let v = 0
  if (c?.story) v += 1500
  if (c && c.kind === 'fragile' && need(s, "fragileGood")) v += 250
  const rep = need(s, 'rep') as Extract<Objective, { type: 'rep' }> | undefined
  if (c && rep && c.to === rep.island) v += 300
  if (c && need(s, 'deliver')) v += 30
  if (c && need(s, 'total')) v += 25
  const vis = need(s, 'visit') as Extract<Objective, { type: 'visit' }> | undefined
  if (vis && vis.islands.includes(to) && !s.prog[`${vis.id}:${to}`]) v += c ? 0 : 700
  // 主线取货点：空船飞过去也值
  for (const o of objs(s)) if (!c && o.type === 'story' && !s.prog[o.id] && o.from === to && !s.cargo.some((x) => x.id === `story-${o.id}`)) v += 1500
  if (!c && rep && to === rep.island) v += 150
  if (!c && need(s, 'debt') && to === 'port' && s.money >= 300) v += 200 + Math.min(500, s.money * 0.3)
  if (!c && need(s, 'partLv') && (to === 'port' || to === 'workshop') && s.money >= 400) v += 300
  return v
}

function payAt(s: S, amount: number, kind: 'fuel' | 'parts' | 'repair' | 'debt') {
  const p = Math.min(s.money, Math.max(0, Math.round(amount)))
  s.money -= p
  if (kind === 'fuel') s.spentFuel += p
  else if (kind === 'parts') s.spentParts += p
  else if (kind === 'repair') s.spentRepair += p
  return p
}

const UPGRADE_ORDER: [Part, number][] = [['hold', 2], ['prop', 2], ['boiler', 2], ['armor', 2], ['envelope', 2], ['hold', 3], ['prop', 3], ['boiler', 3], ['armor', 3], ['envelope', 3], ['hold', 4], ['prop', 4]]

function portActions(s: S) {
  const isl = s.at
  // 补给到满
  const cp = COAL_PRICE[isl] ?? 1, wp = WATER_PRICE[isl] ?? 1
  const cn = 1 - s.coal, wn = 1 - s.water
  const cc = Math.ceil(cn * 100 * cp), wc = Math.ceil(wn * 100 * wp)
  if (s.money >= cc + wc) { payAt(s, cc + wc, 'fuel'); s.coal = 1; s.water = 1 }
  else if (s.money < 20 * cp && (s.coal < 0.25 || s.water < 0.25)) { s.coal = Math.max(s.coal, 0.6); s.water = Math.max(s.water, 0.6); s.reliefs++ }
  else { const k = s.money / Math.max(1, cc + wc); payAt(s, s.money, 'fuel'); s.coal += cn * k; s.water += wn * k }
  // 修理（云港 / 工坊城）
  const m = mods(s)
  if (REPAIR_PRICE[isl] && s.holes > 0) { const pr = Math.round(35 * REPAIR_PRICE[isl]); const n = Math.min(s.holes, Math.floor(s.money / pr)); if (n > 0) { payAt(s, n * pr, 'repair'); s.holes -= n } }
  if (REPAIR_PRICE[isl] && s.hp < m.hpMax * 0.8) { const n = Math.min(m.hpMax - s.hp, s.money / REPAIR_PRICE[isl]); payAt(s, n * REPAIR_PRICE[isl], 'repair'); s.hp += n }
  // 还债（第五章，保留 250 运营资金）
  if (isl === 'port' && need(s, 'debt') && s.money > 250) { const n = Math.min(s.debt, s.money - 250); s.debt -= n; s.money -= n }
  // 改装
  if (isl === 'port' || isl === 'workshop') {
    const reserve = need(s, 'debt') ? 1e9 : 250
    if (need(s, 'partLv')) {
      // 第二章：买最便宜的 Lv2
      const opts = (Object.keys(PARTS) as Part[]).filter((p) => s.parts[p] === 1).map((p) => [p, partCost(p, 1, isl)] as const).sort((a, b) => a[1] - b[1])
      if (opts.length && s.money >= opts[0][1]) buy(s, opts[0][0], isl)
    }
    for (const [p, lv] of UPGRADE_ORDER) {
      if (s.parts[p] !== lv - 1) continue
      const req = partReq(p, s.parts[p])
      if (req && (s.rep[req.island] ?? 0) < req.rep) continue
      const cost = partCost(p, s.parts[p], isl)
      if (s.money - cost >= reserve) buy(s, p, isl)
    }
  }
}
function buy(s: S, p: Part, isl: string) {
  const lv = s.parts[p]
  payAt(s, partCost(p, lv, isl), 'parts')
  s.parts[p] = lv + 1
  if (p === 'hold') { s.slots = TABLE.hold.slots[lv]; s.maxW = TABLE.hold.weight[lv] }
  if (p === 'armor') s.hp += TABLE.armor.hp[lv] - TABLE.armor.hp[lv - 1]
  if (VERBOSE) console.log(`  [${(s.t / 60).toFixed(1)}m] 改装 ${PARTS[p].name} Lv${lv + 1}`)
}

function choose(s: S) {
  const list = board(s, s.at)
  // 1) 接单：按（报酬 + 主线价值）/ 直飞用时 排序，装满货位 / 载重；会超时的加急件不接；太远（>3000 米）的普通单不接
  const cand = list.map((c) => {
    const lt = legTime(s, s.at, c.to, load(s.cargo) + c.weight)
    return { c, lt, v: (c.reward + objValue(s, c, c.to)) / (lt.fly + PORT_DWELL) }
  }).sort((a, b) => b.v - a.v)
  const take: Contract[] = []
  let slots = s.slots - s.cargo.length, w = s.maxW - load(s.cargo)
  // 有待取的主线货物时，给它留出货位和载重（玩家看得到主线追踪）
  const pend = objs(s).filter((o) => o.type === 'story' && !s.prog[o.id] && !s.cargo.some((x) => x.id === `story-${o.id}`) && o.from !== s.at) as Extract<Objective, { type: 'story' }>[]
  const keepSlots = pend.length, keepW = pend.reduce((a, o) => a + o.weight, 0)
  for (const { c, lt } of cand) {
    if (slots <= 0 || c.weight > w + 1e-6) continue
    if (!c.story && (slots - 1 < keepSlots || w - c.weight < keepW)) continue
    if (c.kind === "urgent" && !c.story && lt.fly > c.limit * 0.85) continue
    if (!c.story && lt.dist > 3000) continue
    take.push(c); slots--; w -= c.weight
  }
  // 2) 下一站：货舱 + 新接货物的目的地、主线目标岛中，按（价值 / 用时）选
  const cargo = [...s.cargo, ...take]
  const dests = new Set<string>(cargo.map((c) => c.to))
  for (const isl of ISLANDS) if (isl.id !== s.at && objValue(s, null, isl.id) > 0) dests.add(isl.id)
  let best: { to: string; score: number } | null = null
  for (const to of dests) {
    const lt = legTime(s, s.at, to, load(cargo))
    let val = objValue(s, null, to)
    for (const c of cargo) if (c.to === to) {
      val += c.reward + objValue(s, c, to)
      // 加急件快到期时优先
      if (c.kind === 'urgent') val += 120
    }
    let score = val / (lt.fly + PORT_DWELL)
    // 煤不够飞到就尽量不去（玩家看得到续航）
    const m = mods(s), w = load(cargo)
    const need = (coalRate(0.5 + w * m.loadLift, 0.75) + w * 0.00008) * m.coalMul * lt.fly
    if (need > s.coal * 0.95) score *= 0.05
    if (!best || score > best.score) best = { to, score }
  }
  if (!best) {
    // 无事可做：去声望最低的近岛接单
    const near = ISLANDS.filter((i) => i.id !== s.at).map((i) => ({ id: i.id, t: legTime(s, s.at, i.id, 0).fly })).sort((a, b) => a.t - b.t)
    best = { to: near[0].id, score: 0 }
  }
  return { to: best.to, take }
}

function settle(s: S, c: Cargo, used: number, night: boolean) {
  const base = c.reward
  let bonus = 0, late = 0
  if (c.kind === 'urgent') { if (used <= c.limit) bonus = Math.round(base * 0.25 * Math.min(1, ((c.limit - used) / c.limit) * 2)); else late = Math.round(base * 0.5) }
  else if (used <= c.limit) bonus = Math.round(base * 0.1)
  if (c.flags.includes('pirate')) bonus += Math.round(base * 0.08)
  if (c.flags.includes('storm') && c.kind === 'urgent' && used <= c.limit) bonus += Math.round(base * 0.1)
  const damage = c.kind === 'fragile' ? Math.round(base * (1 - c.condition)) : 0
  const total = Math.max(0, base + bonus - damage - late)
  s.money += total; s.earned += total; s.deliveries++
  const r = 2 + (!late && c.condition > 0.9 ? 1 : 0)
  s.rep[c.to] = Math.min(100, (s.rep[c.to] ?? 0) + r)
  s.rep[c.from] = Math.min(100, (s.rep[c.from] ?? 0) + 1)
  for (const o of objs(s)) {
    if (o.type === 'deliver') s.prog[o.id] = (s.prog[o.id] ?? 0) + 1
    if (o.type === 'fragileGood' && c.kind === 'fragile' && c.condition >= 0.9) s.prog[o.id] = (s.prog[o.id] ?? 0) + 1
    if (o.type === 'stormDeliver' && c.flags.includes('storm')) s.prog[o.id] = (s.prog[o.id] ?? 0) + 1
    if (o.type === 'nightDeliver' && night) s.prog[o.id] = (s.prog[o.id] ?? 0) + 1
    if (o.type === 'story' && c.story === o.id && (!o.minCond || c.condition >= o.minCond)) s.prog[o.id] = 1
  }
}

function checkChapter(s: S) {
  for (const o of objs(s)) if (s.objT[o.id] === undefined && done(o, s)) s.objT[o.id] = s.t
  while (s.ch <= CHAPTERS.length && objs(s).every((o) => done(o, s))) {
    const ch = CHAPTERS[s.ch - 1]
    s.money += ch.reward.money; s.earned += ch.reward.money
    s.chT.push(s.t)
    s.t += CARD_TIME
    if (VERBOSE) console.log(`== 第${s.ch}章完成 @ ${(s.t / 60).toFixed(1)} 分钟 · 银币 ${s.money}`)
    s.ch++; s.prog = {}
  }
}

function fly(s: S, to: string) {
  const w = load(s.cargo)
  const lt = legTime(s, s.at, to, w)
  let time = lt.fly
  const m = mods(s)
  // 第三章需要穿越雷暴：主动绕去雷暴（+80 秒）；平时约 15% 的航程擦过雷暴
  const seekStorm = need(s, 'stormDeliver') && s.cargo.length > 0
  const storm = seekStorm || rnd() < 0.15
  if (seekStorm) time += 80
  // 空贼：载货价值 ≥120、已交付 ≥2 单时按真实刷新概率；75% 甩开，25% 被抢走一件
  const V = s.cargo.reduce((a, c) => a + c.reward, 0)
  let pirate = false
  if (s.deliveries >= 2 && V >= 120) {
    const p = 1 - Math.exp(-Math.min(0.02, V / 30000) * (time - LEG_OVERHEAD) * 0.45)
    if (rnd() < p) {
      pirate = true
      time += 25
      // v1.2：未武装货船会挨“威慑射击”——追击 12 秒后每 10 秒 2 发，每发 3 伤害（装甲减免），命中气囊 12% 击穿
      const chase = 20 + rnd() * 25
      const volleys = chase > 12 ? Math.floor((chase - 12) / 10) + 1 : 0
      for (let i = 0; i < volleys * 2; i++) if (rnd() < 0.45) { const d = 3 * (1 - m.bumpRes * 0.9); s.hp -= d; s.shotDmg += d; if (rnd() < 0.12) s.holes++ }
      if (rnd() < 0.75) { s.cargo.forEach((c) => c.flags.push('pirate')); for (const o of objs(s)) if (o.type === 'pirate') s.prog[o.id] = (s.prog[o.id] ?? 0) + 1 }
      else { const vic = [...s.cargo].sort((a, b) => b.reward - a.reward).find((c) => !c.story); if (vic) { s.cargo = s.cargo.filter((c) => c !== vic); s.lost++ } }
    }
  }
  if (storm) { s.cargo.forEach((c) => c.flags.push('storm')); s.hp -= 14 * (1 - m.bumpRes) * (seekStorm ? 1.5 : 1) }
  // 易碎品：颠簸损耗
  for (const c of s.cargo) if (c.kind === 'fragile' && (rnd() < 0.3 || storm)) c.condition = Math.max(0, c.condition - (0.05 + rnd() * 0.2) * m.fragile)
  s.hp -= (2 + rnd() * 4) * (1 - m.bumpRes)
  // 燃料
  const flyT = time - LEG_OVERHEAD * 0.4
  const cr = (coalRate(0.5 + w * m.loadLift, 0.75) + w * 0.00008) * m.coalMul
  const wr = waterRate(0.5 + w * m.loadLift, 0.75)
  s.coal -= cr * flyT; s.water -= wr * flyT
  if (s.coal < 0 || s.water < 0) {
    // 燃料耗尽：拖船
    const fee = Math.round(40 + lt.dist * 0.5 * 0.05)
    payAt(s, fee, 'fuel'); s.tows++
    s.cargo = s.cargo.filter((c) => { if (!c.story && (c.kind === 'fragile' || c.kind === 'urgent')) { s.lost++; return false } return true })
    s.coal = Math.max(0.05, s.coal); s.water = Math.max(0.05, s.water)
  }
  s.t += time
  s.tod = (s.tod + time * HOURS_PER_SEC) % 24
  s.at = to
  s.legs++
  const d = dockOf(to)
  // 靠泊：浓雾 / 造访
  const fog = fogAt(d.x, d.y, d.z, s.tod) > 0.35
  for (const o of objs(s)) {
    if (o.type === 'fogDock' && fog) s.prog[o.id] = (s.prog[o.id] ?? 0) + 1
    if (o.type === 'visit' && o.islands.includes(to)) s.prog[`${o.id}:${to}`] = 1
  }
  const night = isNight(s.tod)
  for (const c of s.cargo.filter((c) => c.to === to)) settle(s, c, s.t - c.acceptedAt, night)
  s.cargo = s.cargo.filter((c) => c.to !== to)
  // 加急件严重超时作废
  s.cargo = s.cargo.filter((c) => { if (c.kind === 'urgent' && s.t - c.acceptedAt > c.limit * 1.5) { s.lost++; return false } return true })
  void pirate
}

function run(seed: number) {
  rnd = seeded(seed)
  Math.random = rnd
  const s: S = {
    t: 60, tod: START_TOD, money: START_MONEY, rep: Object.fromEntries(ISLANDS.map((i) => [i.id, 0])), parts: { boiler: 1, envelope: 1, prop: 1, hold: 1, armor: 1 },
    slots: TABLE.hold.slots[0], maxW: TABLE.hold.weight[0], hp: TABLE.armor.hp[0], coal: 1, water: 1, at: 'port', cargo: [], boards: {},
    ch: 1, prog: {}, debt: START_DEBT, deliveries: 0, earned: 0, spentFuel: 0, spentParts: 0, spentRepair: 0, tows: 0, reliefs: 0, lost: 0, holes: 0, shotDmg: 0, chT: [], objT: {}, moneyAt: [], legs: 0,
  }
  let guard = 0
  while (s.ch <= CHAPTERS.length && guard++ < 600) {
    portActions(s)
    checkChapter(s)
    if (s.ch > CHAPTERS.length) break
    // 雾中靠泊目标：远岛都去过了还没碰上雾，就在雾区岛之间往返（模拟玩家专门去找雾）
    const pick = choose(s)
    const list = s.boards[s.at].list
    for (const c of pick.take) {
      s.cargo.push({ ...c, condition: 1, acceptedAt: s.t, flags: [] })
      s.boards[s.at].list = list.filter((x) => x.id !== c.id)
    }
    s.t += PORT_DWELL
    if (VERBOSE) console.log(`  [${(s.t / 60).toFixed(1)}m ch${s.ch}] ${s.at}→${pick.to} 接${pick.take.length}单(${pick.take.map((c) => c.kind[0] + c.reward).join(',')}) 货舱${s.cargo.length} 银${s.money} 煤${s.coal.toFixed(2)} prog=${JSON.stringify(s.prog)} rep工${s.rep.workshop}港${s.rep.port}`)
    fly(s, pick.to)
    s.moneyAt.push({ t: s.t, m: s.money })
    checkChapter(s)
  }
  return s
}

// ---------------- 汇总 ----------------
const runs: S[] = []
for (let i = 0; i < SEEDS; i++) runs.push(run(Number(process.env.SEED0 ?? 1000) + i))
const pct = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))] }
const fmt = (sec: number) => `${(sec / 60).toFixed(1)}`
const fin = runs.filter((r) => r.chT.length === CHAPTERS.length)
console.log(`云港航运平衡模拟 · ${SEEDS} 次 · 航线辅助 ${ASSIST ? '开' : '关'} · 通关 ${fin.length}/${SEEDS}`)
console.log('章节 | 完成时刻 中位(分钟) | P10~P90 | 本章用时 中位 | 完成时银币 中位')
for (let c = 0; c < CHAPTERS.length; c++) {
  const ts = fin.map((r) => r.chT[c]), dur = fin.map((r) => r.chT[c] - (c ? r.chT[c - 1] : 60))
  console.log(`第${c + 1}章 ${CHAPTERS[c].title} | ${fmt(pct(ts, 0.5))} | ${fmt(pct(ts, 0.1))}~${fmt(pct(ts, 0.9))} | ${fmt(pct(dur, 0.5))}`)
}
// 每章最后完成的目标（瓶颈）
for (let c = 0; c < CHAPTERS.length; c++) {
  const cnt: Record<string, number> = {}
  for (const r of fin) { const o = [...CHAPTERS[c].objs].sort((a, b) => (r.objT[b.id] ?? 0) - (r.objT[a.id] ?? 0))[0]; cnt[o.text] = (cnt[o.text] ?? 0) + 1 }
  console.log(`  第${c + 1}章瓶颈：` + Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / fin.length * 100)}%`).join(' / '))
}
const med = (f: (r: S) => number) => Math.round(pct(fin.map(f), 0.5))
console.log(`通关总时长 中位 ${fmt(pct(fin.map((r) => r.chT.at(-1)!), 0.5))} 分钟（P10 ${fmt(pct(fin.map((r) => r.chT.at(-1)!), 0.1))} · P90 ${fmt(pct(fin.map((r) => r.chT.at(-1)!), 0.9))}）`)
console.log(`交付 ${med((r) => r.deliveries)} 单 · 航段 ${med((r) => r.legs)} · 总收入 ${med((r) => r.earned)} · 燃料 ${med((r) => r.spentFuel)} · 改装 ${med((r) => r.spentParts)} · 修理 ${med((r) => r.spentRepair)} · 拖船 ${med((r) => r.tows)} · 救济 ${med((r) => r.reliefs)}（最多 ${Math.max(...fin.map((r) => r.reliefs))}） · 损失货物 ${med((r) => r.lost)} · 空贼炮伤 ${med((r) => Math.round(r.shotDmg))} · 通关时银币 ${med((r) => r.money)}`)
console.log(`通关时改装等级（中位）：${(['boiler', 'envelope', 'prop', 'hold', 'armor'] as Part[]).map((p) => `${PARTS[p].name}Lv${med((r) => r.parts[p])}`).join(' ')}`)
// 银币曲线（每 10 分钟，中位）
const curve: string[] = []
for (let m = 10; m <= 100; m += 10) {
  const vals = fin.map((r) => { let v = START_MONEY; for (const p of r.moneyAt) if (p.t <= m * 60) v = p.m; return v })
  curve.push(`${m}分:${Math.round(pct(vals, 0.5))}`)
}
console.log('银币曲线（中位）：' + curve.join(' · '))
// 最长单章（卡关检测）
const worst = fin.map((r) => Math.max(...r.chT.map((t, i) => t - (i ? r.chT[i - 1] : 60))))
console.log(`单章最长用时 中位 ${fmt(pct(worst, 0.5))} 分钟 · P90 ${fmt(pct(worst, 0.9))} 分钟`)
void islandName; void FUEL
if (process.env.TAIL) {
  const c = Number(process.env.TAIL) - 1
  const long = fin.filter((r) => r.chT[c] - (c ? r.chT[c - 1] : 60) > 35 * 60)
  console.log(`第${c + 1}章超过 35 分钟的局：${long.length}`)
  for (const r of long.slice(0, 5)) console.log(CHAPTERS[c].objs.map((o) => `${o.id}@${((r.objT[o.id] - (c ? r.chT[c - 1] : 60)) / 60).toFixed(1)}`).join(' '))
}
if (process.env.STUCK) {
  const bad = runs.map((r, i) => ({ r, i })).filter(({ r }) => r.chT.length < CHAPTERS.length || r.chT.at(-1)! > 300 * 60)
  console.log('卡住的种子：', bad.slice(0, 5).map(({ r, i }) => `${1000 + i}(ch${r.ch}, 银${Math.round(r.money)}, 货舱${r.cargo.length}/${r.slots} ${r.cargo.map((c) => c.to + c.weight).join(',')} prog=${JSON.stringify(r.prog)} parts=${JSON.stringify(r.parts)} maxW=${r.maxW})`).join('\n'))
}
