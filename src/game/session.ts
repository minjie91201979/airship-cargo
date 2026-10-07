import { DOCK_RANGE, dockCheck, neutralPressure, nearestDockFlat, placeAtDock, resetShip, ship, shipEvents, tryDock } from './flight'
import { shipMods } from './upgrades'
import { hullOf } from './hulls'
import { frostK, regionAt } from './world'
import { isNight } from './events'
import { HOURS_PER_SEC, START_TOD, env } from './env'
import { resetHazards, stepHazards } from './hazards'
import { combatHooks, resetCombat, stepCombat } from './combat'
import { cargoWeight, dockOf, islandName, rt, useEco } from './economy'
import { useGame } from './store'
import type { Dock } from './world'
import { emit } from './events'
import { checkStory, introCard, pushCard, useStory } from './story'
import { checkAchv } from './achv'

/** 把飞行、经济、界面状态串起来的会话逻辑 */

// 载重同步到物理
let lastParts: unknown = null
let lastHull = ''
const applyLoad = () => {
  const e = useEco.getState()
  ship.wrecked = e.hp <= 0
  const holes = e.holes ?? 0
  const w = cargoWeight(e.cargo)
  ship.coldKit = !!e.coldKit
  const hull = e.hull ?? 'standard'
  if (w === ship.load && e.parts === lastParts && hull === lastHull && holes === ship.holes) return
  if (holes !== ship.holes) { ship.holes = holes; ship.leak = Math.min(ship.leak, holes * 0.035) }
  if (e.parts !== lastParts || hull !== lastHull) { lastParts = e.parts; lastHull = hull; ship.mods = shipMods(e.parts, hullOf(hull)) }
  ship.load = w
  // 系泊中装卸货：自动把锅炉目标压力调到新的中性浮力，不会意外解缆
  if (ship.docked) ship.target = neutralPressure()
}
useEco.subscribe(applyLoad)

// 碰撞损坏易碎品（重着陆同样算碰撞）
shipEvents.onImpact = (v) => {
  const e = useEco.getState()
  const m = ship.mods
  // 船体耐久：装甲的抗颠簸减免
  const before = e.hp
  e.damageHull((v - 1.5) * 5 * (1 - m.bumpRes))
  if (before > 0 && useEco.getState().hp <= 0) e.note('船体耐久耗尽！推力受限，请尽快靠港修理', true)
  if (v < 2.2) return
  // 易碎品：装甲减免
  e.damageFragile(Math.min(0.5, ((v - 2.2) * 0.09 + 0.03) * m.fragile))
}

/** 开始航程：continueSave=true 从上次停靠的港口继续 */
export function startSession(continueSave: boolean) {
  const eco = useEco.getState()
  if (continueSave && eco.started) {
    rt.clock = eco.clock
    rt.distance = eco.stats.distance
    env.tod = eco.tod ?? START_TOD
    resetHazards()
    applyLoad()
    placeAtDock(dockOf(eco.lastDock), eco.coal, eco.water)
    resetCombat()
  } else {
    eco.newGame()
    env.tod = START_TOD
    resetHazards()
    applyLoad()
    resetShip()
    resetCombat()
  }
  useGame.getState().begin()
  const st = useEco.getState()
  st.note(continueSave ? `欢迎回来 · 停靠于${islandName(st.lastDock)}` : '新的航程开始了！按 E 打开港口面板承接委托')
  useStory.setState({ cards: [], pausedByCard: false })
  // 新游戏（或旧存档首次进入 M5）先播放开场剧情
  if (!st.story.intro) { pushCard(introCard()); st.setStory({ intro: true }) }
  checkStory()
  checkAchv()
}

function arrive(d: Dock, tow = false) {
  const glide = !tow && ship.coal <= 0.001
  useEco.getState().arrive(d.island.id)
  emit({ t: 'dock', island: d.island.id, fog: env.fog, glide, tow })
  useEco.getState().sync(ship.coal, ship.water)
  useGame.getState().openPort(useEco.getState().settlement ? 'board' : undefined)
}

/** E：靠泊（或已系泊时重新打开港口面板） */
export function dockOrOpen() {
  if (useGame.getState().screen !== 'play') return
  if (ship.docked) { useGame.getState().openPort(); return }
  const d = tryDock()
  if (d) { arrive(d); return }
  // 不满足条件时给出明确原因
  const c = dockCheck()
  useEco.getState().note(c.dist > DOCK_RANGE * 2.5 ? `附近没有栈桥（最近：${c.dock.island.name}栈桥 ${Math.round(c.dist)} 米）` : `暂时无法靠泊${c.dock.island.name}：${c.reason}`, true)
}

/** 拖船费用 */
export function towFee() {
  return Math.round(40 + nearestDockFlat().dist * 0.05)
}

let towArmedUntil = 0
/** H：紧急拖航（需连按两次确认） */
export function requestTow(): boolean {
  if (useGame.getState().screen !== 'play') return false
  const eco = useEco.getState()
  if (ship.docked) { eco.note('已在港口系泊，无需拖船'); return false }
  const now = performance.now()
  if (now > towArmedUntil) {
    towArmedUntil = now + 3500
    eco.note(`再按一次 H 呼叫拖船：费用约 ${towFee()} 银币（不足则收取全部），易碎品与加急件将损失`, true)
    return false
  }
  towArmedUntil = 0
  doTow('紧急拖航')
  return true
}

/** 执行拖航：收费、损失高风险货物、拖到最近港口并补一点应急燃料，永不卡死 */
export function doTow(reason: string) {
  const eco = useEco.getState()
  const fee = towFee()
  const paid = eco.pay(fee)
  eco.loseRisky(reason)
  const { dock } = nearestDockFlat()
  placeAtDock(dock, Math.max(ship.coal, 0.2), Math.max(ship.water, 0.2), true)
  eco.note(`${reason}：拖船把飞艇拖到${dock.island.name}，收费 ${paid} 银币${paid < fee ? '（已尽数收取）' : ''}`, true)
  arrive(dock, true)
}

combatHooks.tow = (reason) => doTow(reason)

let acc1 = 0, acc3 = 0
let lastX = ship.pos.x, lastZ = ship.pos.z
/** 每帧（仅航行中）调用 */
export function tickSession(dt: number) {
  rt.clock += dt
  env.tod = (env.tod + dt * HOURS_PER_SEC) % 24
  stepHazards(dt)
  stepCombat(dt)
  const d = Math.hypot(ship.pos.x - lastX, ship.pos.z - lastZ)
  if (d < 50) rt.distance += d
  lastX = ship.pos.x
  lastZ = ship.pos.z
  acc1 += dt
  acc3 += dt
  if (acc1 > 1) {
    acc1 = 0
    useEco.getState().failExpired()
    // v1.3 冰鲜货融化：霜原几乎不化；云港群岛白天快、夜里慢；系泊时（港口冰窖）减半
    const frost = regionAt(ship.pos.x, ship.pos.z) === 'frost' || frostK(ship.pos.z) > 0.6
    const rate = frost ? 0.0002 : isNight(env.tod) ? 0.0006 : 0.0012
    useEco.getState().meltCargo(rate * (ship.docked ? 0.5 : 1))
  }
  if (acc3 > 3) { acc3 = 0; useEco.getState().sync(ship.coal, ship.water) }
}
