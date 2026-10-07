import * as THREE from 'three'
import { ship } from './flight'
import { dockOf, islandName, useEco, BOSS_ZONE, type Mission } from './economy'
import { WTABLE, WEAPONS, hasArms, type WeaponId } from './weapons'
import { emit, onEvent } from './events'
import { inSafeZone, lure, pirate, stormAt, summonStorm, PIRATE_CEIL } from './hazards'
import { fanfare } from './fanfare'
import { qcfg } from './settings'
import { pushCard, type Line } from './story'
import { ISLANDS, type Dock } from './world'

/**
 * v1.2 战斗与护航：
 * - 玩家武器：蒸汽机炮（速射 + 过热 + 自动瞄准）、鱼叉（钩住拖拽）、照明弹（诱饵干扰）
 * - 敌船：随机空贼（hazards.pirate）+ 委托敌船（护航袭击者 / 悬赏目标 / 小艇 / 首领「黑帆号」）
 * - 炮弹有实体与曳光；命中船体扣耐久（装甲减免），命中气囊可能击穿造成漏气
 * 只在航行中由 session.tickSession 推进；渲染端（Combat.tsx）与 HUD 每帧读取这里的状态。
 */

// ---------------- 类型 ----------------
export type FoeKind = 'raider' | 'skiff' | 'named' | 'boss'
export type Target = {
  kind: FoeKind | 'pirate'
  name: string
  pos: THREE.Vector3
  vel: THREE.Vector3
  yaw: number
  hp: number
  maxHp: number
  hooked: boolean
  blind: number
  dead: number
  flash: number
}
export type Foe = Target & {
  kind: FoeKind
  id: number
  fireT: number
  target: 'player' | 'npc'
  mode: 'fight' | 'flee'
  orbit: number
  ramT: number
  ramCd: number
}
type FoeDef = { hp: number; speed: number; r: number; scale: number; standoff: number; volley: number; dmg: number; interval: number; range: number; bounty: number }
export const FOE_DEF: Record<FoeKind | 'pirate', FoeDef> = {
  pirate: { hp: 70, speed: 14.8, r: 12, scale: 1, standoff: 0, volley: 3, dmg: 3, interval: 7, range: 230, bounty: 0 },
  raider: { hp: 70, speed: 15, r: 12, scale: 1, standoff: 150, volley: 3, dmg: 4, interval: 6.5, range: 280, bounty: 60 },
  skiff: { hp: 26, speed: 19, r: 6.5, scale: 0.5, standoff: 95, volley: 1, dmg: 2.5, interval: 2.8, range: 210, bounty: 20 },
  named: { hp: 190, speed: 15.5, r: 14, scale: 1.25, standoff: 170, volley: 4, dmg: 4.5, interval: 6, range: 300, bounty: 0 },
  boss: { hp: 1500, speed: 11, r: 30, scale: 2.5, standoff: 230, volley: 6, dmg: 5, interval: 6.5, range: 360, bounty: 0 },
}
export const radiusOf = (t: Target) => FOE_DEF[t.kind].r

export type Shot = { pos: THREE.Vector3; prev: THREE.Vector3; vel: THREE.Vector3; t: number; life: number; dmg: number; team: 0 | 1; kind: 0 | 1 | 2; src: Target | null; homing: Target | null; toNpc: boolean }
export type Particle = { pos: THREE.Vector3; vel: THREE.Vector3; t: number; life: number; size: number; kind: 0 | 1 | 2 }
export type Flare = { pos: THREE.Vector3; vel: THREE.Vector3; t: number; life: number }

export const foes: Foe[] = []
export const shots: Shot[] = []
export const particles: Particle[] = []
export const flares: Flare[] = []
const MAX_SHOTS = 220, MAX_PARTS = 360

/** 玩家武器运行时 */
export const arms = {
  heat: 0,
  over: false,
  fireCd: 0,
  /** 开火输入：键盘 C / 鼠标左键 / 手柄 RB */
  key: false,
  mouse: false,
  pad: false,
  muzzle: 0,
  harpCd: 0,
  hook: null as Target | null,
  hookT: 0,
  hookLen: 0,
  harp: null as Shot | null,
  flareCd: 0,
  lock: null as Target | null,
  aimYaw: 0,
  aimPitch: 0,
  /** 镜头震动（命中 / 爆炸） */
  shake: 0,
  /** 镜头（HUD 投影用，由 World 注册） */
  cam: null as THREE.Camera | null,
  /** 近期是否在战斗（音乐 / 提示用） */
  hot: 0,
}

/** 护航商船 */
export const npc = {
  active: false,
  name: '',
  state: 'wait' as 'wait' | 'go' | 'done',
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  hp: 100,
  from: null as Dock | null,
  to: null as Dock | null,
  total: 1,
  prog: 0,
  waves: [] as number[],
  wave: 0,
  halted: false,
  hitT: 0,
  flash: 0,
}
/** 首领战 */
export const boss = { foe: null as Foe | null, phase: 0, skiffT: 0, introShown: false }
/** 悬赏 */
const bounty = { foe: null as Foe | null }

/** 由 session 注册：拖船（避免循环引用） */
export const combatHooks: { tow: ((reason: string) => void) | null; sfx: ((k: string, level?: number) => void) | null } = { tow: null, sfx: null }
const play = (k: string, level = 1) => combatHooks.sfx?.(k, level)

let fid = 0
const V = () => new THREE.Vector3()
const tmp = V(), tmp2 = V(), gunPos = V(), aimDir = V()

// ---------------- 工具 ----------------
const armsLv = () => useEco.getState().weapons ?? { gun: 0, harpoon: 0, flare: 0 }
const shipCenter = (out: THREE.Vector3) => out.copy(ship.pos)
/** 船体局部坐标 → 世界（只考虑偏航） */
function local(x: number, y: number, z: number, out: THREE.Vector3) {
  const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw)
  return out.set(ship.pos.x + x * c + z * s, ship.pos.y + y, ship.pos.z - x * s + z * c)
}
/** 线段 p0→p1 到点 c 的最近距离 */
function segDist(p0: THREE.Vector3, p1: THREE.Vector3, c: THREE.Vector3) {
  tmp.subVectors(p1, p0)
  const L2 = tmp.lengthSq()
  const t = L2 > 1e-6 ? THREE.MathUtils.clamp(tmp2.subVectors(c, p0).dot(tmp) / L2, 0, 1) : 0
  return tmp2.copy(p0).addScaledVector(tmp, t).distanceTo(c)
}
export function burst(pos: THREE.Vector3, n: number, kind: 0 | 1 | 2, speed: number, size: number, life: number) {
  const k = Math.max(1, Math.round(n * qcfg().particles))
  for (let i = 0; i < k; i++) {
    if (particles.length >= MAX_PARTS) particles.shift()
    const v = V().set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7))
    particles.push({ pos: pos.clone(), vel: v, t: 0, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), kind })
  }
}
function explode(pos: THREE.Vector3, big = 1) {
  burst(pos, 26 * big, 0, 14 * big, 2.6 * big, 1.1)
  burst(pos, 18 * big, 1, 6 * big, 4 * big, 3.2)
  burst(pos, 14 * big, 2, 30 * big, 0.6, 0.8)
  const d = pos.distanceTo(ship.pos)
  arms.shake = Math.max(arms.shake, Math.min(1, big * (1 - d / 600)))
  play('boom', Math.max(0.15, 1 - d / 900) * Math.min(1.4, big))
}

/** 所有可被攻击的目标（随机空贼 + 委托敌船） */
export function targets(): Target[] {
  const out: Target[] = []
  if (pirate.active && !pirate.dead) out.push(pirate as unknown as Target)
  for (const f of foes) if (!f.dead) out.push(f)
  return out
}

// ---------------- 伤害 ----------------
let holeNoteAt = 0
/** 敌方炮弹命中玩家：装甲减免；气囊命中可能击穿 */
function hurtPlayer(dmg: number, envelope: boolean, src: Target | null) {
  const e = useEco.getState()
  const before = e.hp
  const d = dmg * (1 - ship.mods.bumpRes * 0.9)
  e.damageHull(d)
  arms.shake = Math.max(arms.shake, 0.45)
  ship.bump = Math.max(ship.bump, 0.18)
  play('hit', 0.9)
  // 未武装的船只会挨“威慑射击”，击穿概率更低，避免非战斗玩家被拖垮
  if (envelope && Math.random() < (hasArms(e.weapons) ? 0.28 : 0.12)) {
    const holes = Math.min(6, (e.holes ?? 0) + 1)
    useEco.setState({ holes })
    if (performance.now() > holeNoteAt) { holeNoteAt = performance.now() + 4000; e.note(`气囊被击穿！漏气（破洞 ${holes} 处）· 浮力逐渐下降，靠港修补`, true) }
  }
  if (before > 0 && useEco.getState().hp <= 0) e.note('船体耐久耗尽！推力受限——再被击中将被迫拖航', true)
  if (before <= 0) knockedOut(src)
}
/** 船体已耗尽仍被击中：随机空贼直接钩走货物；委托战斗则被拖船救回 */
function knockedOut(src: Target | null) {
  if (src && src.kind === 'pirate') { pirate.grapple = 1; return }
  const m = useEco.getState().mission
  if (m?.mission === 'escort') failEscort('护航船长被击伤拖离战场')
  if (m?.mission === 'boss' && boss.foe) { despawn(boss.foe); boss.foe = null; boss.phase = 0; useEco.getState().note('黑帆号退回锚地休整——修好船再来！（委托保留）', true) }
  if (m?.mission === 'bounty' && bounty.foe) { for (const f of foes) f.mode = 'flee'; bounty.foe = null }
  for (const f of foes) f.mode = 'flee'
  combatHooks.tow?.('船体重创')
}

function hitTarget(t: Target, dmg: number, at?: THREE.Vector3) {
  if (t.dead) return
  t.hp -= dmg
  t.flash = 1
  if (at) burst(at, 3, 2, 18, 0.5, 0.4)
  // 护航袭击者被玩家打疼了会掉头找玩家
  const f = t as Foe
  if (f.target === 'npc' && Math.random() < 0.2) f.target = 'player'
  arms.hot = 3
  if (t.hp <= 0) kill(t)
}

function kill(t: Target) {
  const e = useEco.getState()
  t.hp = 0
  t.dead = 0.01
  const harpooned = t.hooked || arms.hook === t
  if (arms.hook === t) releaseHook(false)
  t.hooked = false
  explode(t.pos, t.kind === 'boss' ? 3 : t.kind === 'skiff' ? 0.6 : 1.2)
  const cb = { ...e.combat, kills: e.combat.kills + 1 }
  let bonus = 0
  if (t.kind === 'pirate') {
    bonus = 80 + Math.round(Math.random() * 60)
    pirate.state = 'flee'
    pirate.cooldown = 200
    e.flagCargo('pirate')
    emit({ t: 'pirateShaken' })
  } else bonus = FOE_DEF[t.kind].bounty
  useEco.setState({ combat: cb, money: e.money + bonus, stats: { ...e.stats, earnings: e.stats.earnings + bonus } })
  if (t.kind !== 'boss' && t.kind !== 'named') e.note(`击落${t.kind === 'skiff' ? '空贼小艇' : '空贼飞艇'}！${bonus ? `缴获赏金 +${bonus} 银币` : ''}`)
  emit({ t: 'kill', kind: t.kind, harpooned, boss: t.kind === 'boss' })
  if (t.kind === 'named' && bounty.foe === t) {
    const m = e.mission
    bounty.foe = null
    if (m?.mission === 'bounty') {
      useEco.getState().finishMission(true, m.reward, `悬赏完成！击落通缉空贼 ${m.foe} · 赏金 +${m.reward} 银币`)
      fanfare('done', '📜', '悬赏完成', `击落 ${m.foe} · 赏金 ${m.reward} 银币`, 5500)
    }
    for (const f of foes) if (!f.dead) f.mode = 'flee'
  }
  if (t.kind === 'boss') bossDefeated()
}

function despawn(f: Foe) {
  const i = foes.indexOf(f)
  if (i >= 0) foes.splice(i, 1)
  if (arms.hook === f) releaseHook(false)
}

// ---------------- 玩家武器 ----------------
/** 在锥角内挑选最佳目标（自动瞄准） */
function pickTarget(range: number, coneDeg: number): Target | null {
  const cone = (coneDeg * Math.PI) / 180
  let best: Target | null = null, bs = Infinity
  for (const t of targets()) {
    tmp.subVectors(t.pos, ship.pos)
    const d = tmp.length()
    if (d > range || d < 5) continue
    const yaw = Math.atan2(tmp.x, tmp.z)
    let dy = yaw - arms.aimYaw
    dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    const pitch = Math.asin(THREE.MathUtils.clamp(tmp.y / d, -1, 1))
    const dp = pitch - arms.aimPitch
    if (Math.abs(dy) > cone || Math.abs(dp) > 0.75) continue
    const score = Math.abs(dy) / cone + d / range * 0.6
    if (score < bs) { bs = score; best = t }
  }
  return best
}
function leadDir(from: THREE.Vector3, t: Target, speed: number, out: THREE.Vector3) {
  const d = from.distanceTo(t.pos)
  const tt = d / speed
  out.copy(t.pos).addScaledVector(t.vel, tt).sub(from).normalize()
  return out
}
function aimVector(out: THREE.Vector3) {
  return out.set(Math.sin(arms.aimYaw) * Math.cos(arms.aimPitch), Math.sin(arms.aimPitch), Math.cos(arms.aimYaw) * Math.cos(arms.aimPitch))
}
function addShot(s: Omit<Shot, 'prev'>) {
  if (shots.length >= MAX_SHOTS) shots.shift()
  shots.push({ ...s, prev: s.pos.clone() })
}

function stepGun(dt: number) {
  const lv = armsLv().gun
  const firing = arms.key || arms.mouse || arms.pad
  arms.muzzle = Math.max(0, arms.muzzle - dt * 12)
  arms.heat = Math.max(0, arms.heat - dt * (firing && !arms.over ? 0.3 : 0.42))
  if (arms.over && arms.heat < 0.3) arms.over = false
  if (!lv) return
  const i = lv - 1
  arms.lock = pickTarget(WTABLE.gun.range[i], WTABLE.gun.cone[i])
  arms.fireCd = Math.max(-0.2, arms.fireCd - dt)
  if (!firing || arms.over || ship.docked) return
  while (arms.fireCd <= 0) {
    arms.fireCd += 1 / WTABLE.gun.rate[i]
    local(lv >= 2 ? (Math.random() < 0.5 ? -0.5 : 0.5) : 0, -9.9, 4.6, gunPos)
    const sp = 300
    if (arms.lock) leadDir(gunPos, arms.lock, sp, aimDir)
    else aimVector(aimDir)
    aimDir.x += (Math.random() - 0.5) * 0.024; aimDir.y += (Math.random() - 0.5) * 0.024; aimDir.z += (Math.random() - 0.5) * 0.024
    aimDir.normalize()
    addShot({ pos: gunPos.clone(), vel: aimDir.clone().multiplyScalar(sp).add(ship.vel), t: 0, life: WTABLE.gun.range[i] / sp, dmg: WTABLE.gun.dmg[i], team: 0, kind: 0, src: null, homing: null, toNpc: false })
    arms.muzzle = 1
    arms.heat += WTABLE.gun.heat[i]
    play('gun', 0.6)
    if (arms.heat >= 1) { arms.heat = 1; arms.over = true; play('overheat'); useEco.getState().note('机炮过热！冷却中……', true); break }
  }
}

/** G / LB：发射或松开鱼叉 */
export function pressHarpoon() {
  const e = useEco.getState()
  const lv = armsLv().harpoon
  if (!lv) { e.note('尚未装备鱼叉（云港 / 工坊城「改装」→ 武器槽）', true); return }
  if (ship.docked) return
  if (arms.hook) { releaseHook(true); return }
  if (arms.harp) return
  if (arms.harpCd > 0) { e.note(`鱼叉装填中（${arms.harpCd.toFixed(1)} 秒）`); return }
  const i = lv - 1
  const range = WTABLE.harpoon.range[i]
  const t = pickTarget(range, 36)
  local(1.7, -8.6, 3, gunPos)
  if (t) leadDir(gunPos, t, 170, aimDir)
  else aimVector(aimDir)
  const s: Omit<Shot, 'prev'> = { pos: gunPos.clone(), vel: aimDir.clone().multiplyScalar(170).add(ship.vel), t: 0, life: range / 170 + 0.3, dmg: WTABLE.harpoon.dmg[i], team: 0, kind: 2, src: null, homing: t, toNpc: false }
  addShot(s)
  arms.harp = shots[shots.length - 1]
  arms.harpCd = 3
  play('harpoon')
}
function releaseHook(manual: boolean) {
  if (arms.hook) arms.hook.hooked = false
  arms.hook = null
  ship.tow = 0
  arms.harpCd = manual ? 2 : 5
  if (manual) useEco.getState().note('松开鱼叉钢缆')
}
function stepHook(dt: number) {
  arms.harpCd = Math.max(0, arms.harpCd - dt)
  const h = arms.hook
  if (!h) { ship.tow = 0; return }
  const lv = Math.max(1, armsLv().harpoon), i = lv - 1
  if (h.dead || (h.kind === 'pirate' && !pirate.active)) { releaseHook(false); return }
  arms.hookT -= dt
  tmp.subVectors(ship.pos, h.pos)
  const d = tmp.length()
  if (arms.hookT <= 0 || d > WTABLE.harpoon.range[i] * 1.9) {
    useEco.getState().note(arms.hookT <= 0 ? '鱼叉钢缆脱钩' : '钢缆绷断了！', arms.hookT > 0)
    releaseHook(false)
    return
  }
  const isBoss = h.kind === 'boss'
  ship.tow = isBoss ? 0.7 : 0.3
  if (d > arms.hookLen) {
    // 拖拽：把敌船拉向自己（首领太重，反而拖慢我们）
    const pull = (d - arms.hookLen) * (isBoss ? 0.08 : 1.6) * dt
    tmp.normalize()
    h.pos.addScaledVector(tmp, Math.min(pull, d - arms.hookLen))
    h.vel.multiplyScalar(1 - Math.min(1, dt * (isBoss ? 0.3 : 1.4)))
    if (isBoss) ship.vel.addScaledVector(tmp, -Math.min(2, (d - arms.hookLen) * 0.02) * dt * 4)
  }
  hookDmgAcc += WTABLE.harpoon.dps[i] * dt
  if (hookDmgAcc >= 2) { hitTarget(h, hookDmgAcc); hookDmgAcc = 0 }
}
let hookDmgAcc = 0

/** Z / 十字键←：投放照明弹 */
export function dropFlare() {
  const e = useEco.getState()
  const lv = armsLv().flare
  if (!lv) { e.note('尚未装备照明弹（云港 / 工坊城「改装」→ 武器槽）', true); return }
  if (ship.docked) return
  if (arms.flareCd > 0) return
  if ((e.flares ?? 0) <= 0) { e.note('照明弹用完了——靠港在「补给」页补充', true); return }
  const i = lv - 1
  useEco.setState({ flares: e.flares - 1 })
  const fw = local(0, -10, -9, V())
  flares.push({ pos: fw, vel: ship.vel.clone().multiplyScalar(0.3).add(V().set(0, 5, 0)), t: 0, life: WTABLE.flare.dur[i] + 2 })
  if (flares.length > 4) flares.shift()
  arms.flareCd = 2.5
  let n = 0
  for (const t of targets()) {
    if (t.pos.distanceTo(ship.pos) > WTABLE.flare.radius[i]) continue
    t.blind = WTABLE.flare.dur[i] * (t.kind === 'boss' ? 0.5 : 1)
    n++
  }
  if (pirate.active) pirate.grapple = 0
  burst(fw, 12, 2, 12, 0.7, 1)
  play('flare')
  e.note(n ? `照明弹！${n} 艘敌船被晃得睁不开眼（${WTABLE.flare.dur[i]} 秒）` : '照明弹升空')
}

// ---------------- 敌方开火 ----------------
const G = 4
function volley(src: Target, n: number, dmg: number, aimAt: THREE.Vector3, aimVel: THREE.Vector3, toNpc: boolean, broadside: number) {
  const fx = Math.sin(src.yaw), fz = Math.cos(src.yaw)
  const blind = src.blind > 0
  for (let k = 0; k < n; k++) {
    const off = broadside ? (k / Math.max(1, n - 1) - 0.5) * broadside : (Math.random() - 0.5) * 3
    const from = V().set(src.pos.x + fx * off, src.pos.y - 7 * FOE_DEF[src.kind].scale, src.pos.z + fz * off)
    const sp = 120
    const d = from.distanceTo(aimAt)
    const tt = d / sp
    const spread = d * (blind ? 0.22 : src.kind === 'boss' ? 0.05 : 0.07)
    const tgt = V().copy(aimAt).addScaledVector(aimVel, tt * (blind ? 0 : 1))
    tgt.x += (Math.random() - 0.5) * spread; tgt.y += (Math.random() - 0.5) * spread * 0.6; tgt.z += (Math.random() - 0.5) * spread
    const vel = tgt.sub(from).normalize().multiplyScalar(sp)
    vel.y += 0.5 * G * tt
    addShot({ pos: from, vel, t: -k * 0.13, life: tt + 1.5, dmg, team: 1, kind: 1, src, homing: null, toNpc })
  }
  const dist = src.pos.distanceTo(ship.pos)
  play('cannon', Math.max(0.1, 1 - dist / 900))
  burst(V().set(src.pos.x, src.pos.y - 7 * FOE_DEF[src.kind].scale, src.pos.z), 4, 1, 4, 2.5, 1.4)
}

// ---------------- 弹道 ----------------
const envC = V(), gonC = V()
function stepShots(dt: number) {
  local(0, 0, 0, envC)
  local(0, -8.2, 0, gonC)
  const tg = targets()
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    s.t += dt
    if (s.t < 0) continue
    if (s.t > s.life) {
      if (s.kind === 2 && arms.harp === s) arms.harp = null
      if (s.kind === 1) burst(s.pos, 2, 1, 2, 2, 1)
      shots.splice(i, 1); continue
    }
    s.prev.copy(s.pos)
    if (s.kind === 1) s.vel.y -= G * dt
    if (s.kind === 2 && s.homing && !s.homing.dead) {
      tmp.subVectors(s.homing.pos, s.pos).normalize().multiplyScalar(170)
      s.vel.lerp(tmp, Math.min(1, dt * 2.5))
    }
    s.pos.addScaledVector(s.vel, dt)
    let hit = false
    if (s.team === 0) {
      for (const t of tg) {
        if (t.dead) continue
        if (segDist(s.prev, s.pos, t.pos) < radiusOf(t) * (t.kind === 'boss' ? 1 : 0.8)) {
          if (s.kind === 2) {
            hitTarget(t, s.dmg, s.pos)
            if (!t.dead) {
              const lv = Math.max(1, armsLv().harpoon)
              arms.hook = t; t.hooked = true; arms.hookT = WTABLE.harpoon.hold[lv - 1]
              arms.hookLen = Math.max(45, t.pos.distanceTo(ship.pos) * 0.75)
              play('clank')
              useEco.getState().note(`鱼叉命中！钩住了${t.kind === 'boss' ? '黑帆号（太重了，拖不动）' : t.name}——再按 ${'G / LB'} 松开`)
            }
            arms.harp = null
          } else hitTarget(t, s.dmg, s.pos)
          hit = true
          break
        }
      }
    } else {
      // 敌方炮弹：玩家气囊 / 吊舱、护航商船、照明弹诱饵（直接引爆）
      if (s.toNpc && npc.active) {
        if (segDist(s.prev, s.pos, npc.pos) < 9) { hurtNpc(s.dmg); hit = true }
      } else {
        const env = segDist(s.prev, s.pos, envC) < 7.5
        const gon = !env && segDist(s.prev, s.pos, gonC) < 3.5
        if ((env || gon) && !ship.docked) { hurtPlayer(s.dmg, env, s.src); hit = true }
      }
      if (!hit && s.pos.y < 18) { shots.splice(i, 1); continue }
    }
    if (hit) {
      burst(s.pos, s.kind === 1 ? 8 : 3, s.kind === 1 ? 0 : 2, s.kind === 1 ? 8 : 15, s.kind === 1 ? 1.6 : 0.5, 0.6)
      if (s.kind === 1) burst(s.pos, 4, 1, 3, 2.5, 1.5)
      if (s.kind === 2 && arms.harp === s) arms.harp = null
      shots.splice(i, 1)
    }
  }
}

function stepParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.t += dt
    if (p.t > p.life) { particles.splice(i, 1); continue }
    if (p.kind === 1) { p.vel.y += 1.5 * dt; p.vel.multiplyScalar(1 - dt * 0.8) }
    else if (p.kind === 2) p.vel.y -= 9.8 * dt
    else p.vel.multiplyScalar(1 - dt * 2.2)
    p.pos.addScaledVector(p.vel, dt)
  }
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]
    f.t += dt
    f.vel.y += (-1.2 - f.vel.y) * Math.min(1, dt * 0.8)
    f.vel.x *= 1 - dt * 0.5; f.vel.z *= 1 - dt * 0.5
    f.pos.addScaledVector(f.vel, dt)
    if (Math.random() < dt * 20 * qcfg().particles) burst(f.pos, 1, 2, 3, 0.35, 0.9)
    if (f.t > f.life) flares.splice(i, 1)
  }
  const last = flares[flares.length - 1]
  lure.active = !!last
  if (last) lure.pos.copy(last.pos)
}

// ---------------- 敌船 AI ----------------
export function spawnFoe(kind: FoeKind, pos: THREE.Vector3, target: 'player' | 'npc', name?: string): Foe {
  const D = FOE_DEF[kind]
  const f: Foe = {
    id: ++fid, kind, name: name ?? (kind === 'skiff' ? '空贼小艇' : kind === 'boss' ? '黑帆号' : '空贼飞艇'),
    pos: pos.clone(), vel: V(), yaw: Math.atan2(ship.pos.x - pos.x, ship.pos.z - pos.z), hp: D.hp, maxHp: D.hp,
    hooked: false, blind: 0, dead: 0, flash: 0, fireT: 4 + Math.random() * 3, target, mode: 'fight', orbit: Math.random() < 0.5 ? -1 : 1, ramT: 0, ramCd: 10,
  }
  foes.push(f)
  return f
}
const want = V()
function stepFoes(dt: number) {
  const safe = inSafeZone(ship.pos.x, ship.pos.z) || ship.docked
  for (let i = foes.length - 1; i >= 0; i--) {
    const f = foes[i]
    const D = FOE_DEF[f.kind]
    f.flash = Math.max(0, f.flash - dt * 4)
    if (f.dead) {
      f.dead += dt
      f.vel.y -= 5 * dt
      f.vel.x *= 1 - dt * 0.4; f.vel.z *= 1 - dt * 0.4
      f.pos.addScaledVector(f.vel, dt)
      if (Math.random() < dt * 14 * qcfg().particles) burst(f.pos, 1, 1, 3, 3 * D.scale, 2.5)
      if (f.dead > 7 || f.pos.y < 10) foes.splice(i, 1)
      continue
    }
    f.blind = Math.max(0, f.blind - dt)
    f.fireT -= dt
    const toNpc = f.target === 'npc' && npc.active
    const tp = toNpc ? npc.pos : ship.pos
    const tvel = toNpc ? npc.vel : ship.vel
    tmp.set(tp.x - f.pos.x, 0, tp.z - f.pos.z)
    const dh = tmp.length() || 1
    const dir = tmp.multiplyScalar(1 / dh)
    let speed = D.speed * (f.hooked ? (f.kind === 'boss' ? 0.75 : 0.4) : 1)
    if (f.mode === 'flee') {
      want.set(-dir.x, 0, -dir.z).multiplyScalar(speed * 1.1)
      if (f.pos.distanceTo(ship.pos) > 1300) { despawn(f); continue }
    } else if (f.ramT > 0) {
      // 首领冲撞
      f.ramT -= dt
      speed = 24
      want.copy(dir).multiplyScalar(speed)
      if (f.pos.distanceTo(ship.pos) < D.r + 8 && !ship.docked) {
        f.ramT = 0
        hurtPlayer(20, true, f)
        ship.vel.addScaledVector(dir, 9).y += 2
        ship.bump = 1
        arms.shake = 1
        useEco.getState().note('被黑帆号撞个正着！', true)
      }
    } else {
      const stand = f.blind > 0 ? D.standoff * 2 : safe && !toNpc ? 420 : D.standoff
      // 接近到对峙距离后绕圈（侧舷对着目标）
      const tang = V().set(dir.z * f.orbit, 0, -dir.x * f.orbit)
      if (dh > stand * 1.35) want.copy(dir).multiplyScalar(speed)
      else want.copy(tang).multiplyScalar(speed * 0.85).addScaledVector(dir, THREE.MathUtils.clamp((dh - stand) * 0.12, -speed * 0.6, speed * 0.6))
    }
    f.vel.x += (want.x - f.vel.x) * Math.min(1, dt * (f.kind === 'skiff' ? 1.4 : 0.7))
    f.vel.z += (want.z - f.vel.z) * Math.min(1, dt * (f.kind === 'skiff' ? 1.4 : 0.7))
    const ty = THREE.MathUtils.clamp(tp.y + (f.kind === 'boss' ? 30 : f.kind === 'skiff' ? 8 : 0), 70, f.kind === 'boss' ? 470 : 430)
    f.vel.y += (THREE.MathUtils.clamp((ty - f.pos.y) * 0.25, -3, 3) - f.vel.y) * Math.min(1, dt)
    f.pos.addScaledVector(f.vel, dt)
    // 不进入港口安全区；普通敌船也躲开雷暴
    for (const isl of ISLANDS) {
      const ax = f.pos.x - isl.x, az = f.pos.z - isl.z, L = Math.hypot(ax, az)
      const R = f.mode === 'flee' ? 0 : 300
      if (L < R && L > 1) { f.pos.x += (ax / L) * 25 * dt; f.pos.z += (az / L) * 25 * dt }
      if (L < isl.R + D.r + 10 && f.pos.y < isl.top + 20 && f.pos.y > isl.top - isl.depth) f.pos.y += 8 * dt
    }
    if (f.kind !== 'boss') {
      const sk = stormAt(f.pos.x, f.pos.y, f.pos.z)
      if (sk.storm && sk.k > 0.25) { const ax = f.pos.x - sk.storm.x, az = f.pos.z - sk.storm.z, L = Math.hypot(ax, az) || 1; f.pos.x += (ax / L) * 18 * dt; f.pos.z += (az / L) * 18 * dt }
    }
    const hv = Math.hypot(f.vel.x, f.vel.z)
    if (hv > 0.5) {
      let dy = Math.atan2(f.vel.x, f.vel.z) - f.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      f.yaw += dy * Math.min(1, dt * (f.kind === 'skiff' ? 2.5 : 1.1))
    }
    // 开火
    if (f.mode === 'fight' && f.fireT <= 0) {
      const d3 = f.pos.distanceTo(tp)
      const canHitPlayer = toNpc || !safe
      if (d3 < D.range && canHitPlayer) {
        const aim = f.blind > 0 && lure.active ? lure.pos : tp
        const n = f.kind === 'boss' ? (boss.phase >= 2 ? 5 : D.volley) : D.volley
        volley(f, n, D.dmg, aim, f.blind > 0 ? V() : tvel, toNpc, f.kind === 'boss' ? 40 : f.kind === 'named' ? 10 : 0)
        f.fireT = D.interval * (0.85 + Math.random() * 0.3) * (f.kind === 'boss' && boss.phase >= 2 ? 1.25 : 1)
      } else f.fireT = 0.6
    }
  }
}

// ---------------- 随机空贼还击 ----------------
function stepPirateGuns(dt: number) {
  const P = pirate
  P.flash = Math.max(0, P.flash - dt * 4)
  if (!P.active || P.dead || P.state !== 'chase') return
  P.fireT -= dt
  if (P.fireT > 0 || P.chaseT < 12) return
  const d3 = P.pos.distanceTo(ship.pos)
  const armed = (armsLv().gun + armsLv().harpoon) > 0
  // 未武装的货船：空贼以威慑射击为主（更慢、更少）；已武装：正面交火
  if (d3 < FOE_DEF.pirate.range && !inSafeZone(ship.pos.x, ship.pos.z) && ship.pos.y < PIRATE_CEIL + 40 && !ship.docked) {
    const aim = P.blind > 0 && lure.active ? lure.pos : ship.pos
    volley(P as unknown as Target, armed ? 3 : 2, FOE_DEF.pirate.dmg, aim, P.blind > 0 ? V() : ship.vel, false, 0)
    P.fireT = armed ? 6.5 : 10
  } else P.fireT = 0.8
}

// ---------------- 护航 ----------------
function hurtNpc(d: number) {
  npc.hp = Math.max(0, npc.hp - d)
  npc.flash = 1
  npc.hitT = 3
  play('hit', 0.4)
  const m = useEco.getState().mission
  if (m) useEco.setState({ mission: { ...m, npcHp: Math.round(npc.hp) } })
  if (npc.hp <= 0) {
    explode(npc.pos, 1.5)
    failEscort(`商船「${npc.name}」被击沉`)
  }
}
function failEscort(reason: string) {
  npc.active = false
  npc.state = 'done'
  for (const f of foes) f.mode = 'flee'
  const m = useEco.getState().mission
  if (m?.mission === 'escort') useEco.getState().finishMission(false, 0, `${reason}，护航失败（${islandName(m.from)}声望 -3）`)
}
function startEscort(m: Mission, fromId?: string) {
  const a = dockOf(fromId ?? m.from), b = dockOf(m.to)
  npc.active = true
  npc.name = m.foe ?? '商船'
  npc.state = 'wait'
  npc.from = a; npc.to = b
  // 停在栈桥外侧 45 米、略高处
  npc.pos.set(a.x + Math.sin(a.yaw + Math.PI / 2) * 45, a.y + 22, a.z + Math.cos(a.yaw + Math.PI / 2) * 45)
  npc.vel.set(0, 0, 0)
  npc.yaw = Math.atan2(b.x - a.x, b.z - a.z)
  npc.hp = m.npcHp ?? 100
  npc.total = Math.hypot(b.x - npc.pos.x, b.z - npc.pos.z)
  npc.prog = 0
  npc.waves = npc.total > 1500 ? [0.18, 0.48, 0.76] : [0.22, 0.6]
  npc.wave = 0
  npc.halted = false
}
let haltNoteAt = 0
function stepNpc(dt: number) {
  if (!npc.active || !npc.to) return
  npc.flash = Math.max(0, npc.flash - dt * 3)
  npc.hitT = Math.max(0, npc.hitT - dt)
  const B = npc.to
  const dPlayer = npc.pos.distanceTo(ship.pos)
  if (npc.state === 'wait') {
    npc.vel.set(0, 0, 0)
    if (dPlayer < 320 && !ship.docked) { npc.state = 'go'; useEco.getState().note(`商船「${npc.name}」起航，前往${B.island.name}——跟紧它！`) }
    return
  }
  if (npc.state !== 'go') return
  tmp.set(B.x - npc.pos.x, 0, B.z - npc.pos.z)
  const dh = tmp.length()
  npc.prog = THREE.MathUtils.clamp(1 - dh / npc.total, 0, 1)
  npc.halted = dPlayer > 850
  if (npc.halted && performance.now() > haltNoteAt) { haltNoteAt = performance.now() + 9000; useEco.getState().note(`商船「${npc.name}」放慢速度等你护航（距离 ${Math.round(dPlayer)} 米）`, true) }
  const sp = npc.halted ? 0 : dh < 260 ? Math.max(3, dh * 0.04) : 9.5
  tmp.normalize().multiplyScalar(sp)
  npc.vel.x += (tmp.x - npc.vel.x) * Math.min(1, dt * 0.6)
  npc.vel.z += (tmp.z - npc.vel.z) * Math.min(1, dt * 0.6)
  const ty = dh < 320 ? B.y + 18 : Math.max(250, B.y + 60)
  npc.vel.y += (THREE.MathUtils.clamp((ty - npc.pos.y) * 0.15, -2.2, 2.2) - npc.vel.y) * Math.min(1, dt)
  npc.pos.addScaledVector(npc.vel, dt)
  const hv = Math.hypot(npc.vel.x, npc.vel.z)
  if (hv > 0.3) { let dy = Math.atan2(npc.vel.x, npc.vel.z) - npc.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); npc.yaw += dy * Math.min(1, dt * 0.8) }
  // 袭击波次
  if (npc.wave < npc.waves.length && npc.prog >= npc.waves[npc.wave]) {
    const w = npc.wave++
    const n = w === 0 ? 1 : 2
    const fx = Math.sin(npc.yaw), fz = Math.cos(npc.yaw)
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? -1 : 1
      const p = V().set(npc.pos.x + fx * 520 + fz * side * 220, npc.pos.y + 10, npc.pos.z + fz * 520 - fx * side * 220)
      spawnFoe(w >= 2 && k === 1 ? 'skiff' : 'raider', p, 'npc')
    }
    if (w >= 1) spawnFoe('skiff', V().set(npc.pos.x - fx * 400, npc.pos.y, npc.pos.z - fz * 400), 'npc')
    useEco.getState().note(`⚠ 空贼来袭！${n + (w >= 1 ? 1 : 0)} 艘敌船扑向商船「${npc.name}」`, true)
    play('alarm', 1)
  }
  // 抵达
  if (dh < 70) {
    npc.state = 'done'
    npc.active = false
    for (const f of foes) f.mode = 'flee'
    const m = useEco.getState().mission
    if (m?.mission === 'escort') {
      const hp = Math.round(npc.hp)
      const pay = Math.round((m.reward * (0.3 + 0.7 * hp / 100)) / 5) * 5
      useEco.getState().finishMission(true, pay, `护航完成！商船「${npc.name}」抵达${B.island.name} · 船体 ${hp}% · 报酬 +${pay} 银币`)
      fanfare('done', '🛡', '护航完成', `「${npc.name}」完好度 ${hp}% · 报酬 ${pay} 银币`, 5500)
    }
  }
}

// ---------------- 悬赏 ----------------
let lostNoteAt = 0
function stepBounty(m: Mission) {
  if (!m.zone) return
  const [zx, zz, zr] = m.zone
  const d = Math.hypot(ship.pos.x - zx, ship.pos.z - zz)
  if (!bounty.foe && d < zr + 260) {
    const p = V().set(zx + (Math.random() - 0.5) * 120, THREE.MathUtils.clamp(ship.pos.y, 120, 320), zz + (Math.random() - 0.5) * 120)
    bounty.foe = spawnFoe('named', p, 'player', m.foe)
    spawnFoe('skiff', p.clone().add(V().set(60, 5, 40)), 'player')
    if (m.dist > 1100) spawnFoe('skiff', p.clone().add(V().set(-60, 5, -40)), 'player')
    useEco.getState().note(`发现通缉空贼 ${m.foe}！击落它领取赏金`, true)
    play('alarm', 1)
  } else if (bounty.foe && !bounty.foe.dead && d > 1500) {
    for (const f of [...foes]) despawn(f)
    bounty.foe = null
    if (performance.now() > lostNoteAt) { lostNoteAt = performance.now() + 8000; useEco.getState().note(`${m.foe} 消失在云海中——返回悬赏区域可再次搜寻`, true) }
  }
}

// ---------------- 首领「黑帆号」 ----------------
const BOSS_LINES: Record<number, { title: string; lines: Line[] }> = {
  1: { title: '特别篇 · 黑帆号', lines: [
    { who: 'crow', text: '又是你，云港的新船长。上次让你溜了，这回——黑帆号可不是那条小破艇。' },
    { who: 'crow', text: '炮手就位！侧舷齐射，把他的气囊打成筛子！' },
    { who: 'narrator', text: '黑帆号庞大的船身缓缓转向，一排黑洞洞的炮口对准了你。（提示：保持移动，绕到船首或船尾躲避侧舷齐射；照明弹能干扰炮手）' },
  ] },
  2: { title: '特别篇 · 小艇出击', lines: [
    { who: 'crow', text: '好硬的骨头……放小艇！缠住他！' },
    { who: 'narrator', text: '黑帆号舷侧的舱门打开，几艘快艇呼啸而出。（提示：先清理小艇，或用鱼叉把它们拖走）' },
  ] },
  3: { title: '特别篇 · 风暴帆', lines: [
    { who: 'crow', text: '我在这片云海飘了七年……不会就这么结束！升起风暴帆——全速冲撞！' },
    { who: 'narrator', text: '黑帆号冒着浓烟加速冲来，四周的云层翻滚成雷暴。（提示：它冲撞前会调转船头，侧向闪避！）' },
  ] },
}
const bossCard = (p: number) => pushCard({ kind: 'chapter', title: BOSS_LINES[p].title, sub: '— 黑帆落幕 —', lines: BOSS_LINES[p].lines })
function stepBoss(dt: number) {
  const [zx, zz, zr] = BOSS_ZONE
  const d = Math.hypot(ship.pos.x - zx, ship.pos.z - zz)
  if (!boss.foe) {
    if (d < zr + 320) {
      const p = V().set(zx, THREE.MathUtils.clamp(ship.pos.y + 30, 160, 380), zz)
      boss.foe = spawnFoe('boss', p, 'player', '黑帆号')
      boss.phase = 1
      boss.skiffT = 0
      bossCard(1)
      play('alarm', 1)
    }
    return
  }
  const f = boss.foe
  if (f.dead) return
  if (d > 1800) {
    despawn(f); boss.foe = null; boss.phase = 0
    for (const x of foes) x.mode = 'flee'
    useEco.getState().note('你脱离了战斗，黑帆号退回锚地休整（耐久恢复）', true)
    return
  }
  const k = f.hp / f.maxHp
  if (boss.phase === 1 && k < 0.66) {
    boss.phase = 2
    bossCard(2)
    for (let i = 0; i < 2; i++) spawnFoe('skiff', f.pos.clone().add(V().set(i ? 40 : -40, -10, 0)), 'player')
    boss.skiffT = 18
  } else if (boss.phase === 2 && k < 0.33) {
    boss.phase = 3
    bossCard(3)
    summonStorm(f.pos.x + (ship.pos.x - f.pos.x) * 0.5, f.pos.z + (ship.pos.z - f.pos.z) * 0.5)
    f.ramCd = 4
  }
  if (boss.phase === 2) {
    boss.skiffT -= dt
    if (boss.skiffT <= 0) {
      boss.skiffT = 20
      if (foes.filter((x) => x.kind === 'skiff' && !x.dead).length < 3) spawnFoe('skiff', f.pos.clone().add(V().set(0, -12, 0)), 'player')
    }
  }
  if (boss.phase === 3) {
    f.ramCd -= dt
    if (f.ramCd <= 0 && f.ramT <= 0) { f.ramT = 4.5; f.ramCd = 13; useEco.getState().note('⚠ 黑帆号调转船头——要冲撞了！侧向闪避！', true); play('alarm', 1) }
  }
}
function bossDefeated() {
  const e = useEco.getState()
  boss.phase = 0
  for (const f of foes) if (!f.dead) f.mode = 'flee'
  const liveries = e.liveries.includes('blacksail') ? e.liveries : [...e.liveries, 'blacksail']
  useEco.setState({ money: e.money + 3000, liveries, boss: 2, mission: null, combat: { ...e.combat, bossKills: e.combat.bossKills + 1 }, stats: { ...e.stats, earnings: e.stats.earnings + 3000 } })
  const m = e.mission
  if (m) emit({ t: 'missionEnd', m, ok: true })
  fanfare('chapter', '🏴', '特别篇完成', '「黑帆落幕」 · 奖励 3000 银币 · 涂装「黑帆缴获」', 7000)
  setTimeout(() => pushCard({
    kind: 'chapter', title: '特别篇 · 黑帆落幕', sub: '— 特别篇完成 —',
    lines: [
      { who: 'crow', text: '……咳。好吧，船长，你赢了。黑帆号……就交给云海吧。' },
      { who: 'crow', text: '那道灯塔的光，我其实每晚都在看。也许，云港还肯收留一个老水手？' },
      { who: 'captain', text: '黑帆散了，群岛的商路从此太平。孩子，你做到了连我当年都没做到的事。' },
      { who: 'keeper', text: '商会悬赏 3000 银币，一分不少！那面猩红战帆，就挂在你的船上吧。' },
    ],
    rewards: ['3000 银币', '涂装「黑帆缴获」', '成就「黑帆落幕」'],
    next: '黑帆空贼已经瓦解，但零散的空贼仍会出没。继续自由经营吧！',
  }), 2600)
}

// ---------------- 委托生命周期 ----------------
function cleanupMission() {
  npc.active = false
  npc.state = 'done'
  bounty.foe = null
  if (boss.foe && !boss.foe.dead) despawn(boss.foe)
  boss.foe = null
  boss.phase = 0
  for (const f of foes) if (!f.dead) f.mode = 'flee'
}
function initMission(m: Mission | null, atDock?: string) {
  if (!m) return
  if (m.mission === 'escort') startEscort(m, atDock && atDock !== m.from ? atDock : undefined)
}
onEvent((ev) => {
  if (ev.t === 'mission') {
    initMission(ev.m)
    const m = ev.m
    if (m.mission === 'bounty') useEco.getState().note(`已接悬赏：${m.foe} · 前往小地图上的红色搜索区域`)
    if (m.mission === 'escort') useEco.getState().note(`已接护航：起航后商船「${m.foe}」会跟你一起飞往${islandName(m.to)}`)
    if (m.mission === 'boss') useEco.getState().note('已接特别篇委托：前往云海南缘的「黑帆锚地」（小地图红圈）')
  } else if (ev.t === 'missionEnd') cleanupMission()
  else if (ev.t === 'newGame') resetCombat()
})

/** 新航程 / 读档：清空战斗，按存档恢复进行中的委托 */
export function resetCombat() {
  foes.length = 0
  shots.length = 0
  particles.length = 0
  flares.length = 0
  arms.heat = 0; arms.over = false; arms.hook = null; arms.harp = null; arms.harpCd = 0; arms.flareCd = 0; arms.lock = null; arms.shake = 0
  ship.tow = 0
  npc.active = false
  boss.foe = null; boss.phase = 0
  bounty.foe = null
  lure.active = false
  const e = useEco.getState()
  if (e.started && e.mission) initMission(e.mission, e.lastDock)
}

/** 每帧推进（仅航行中） */
export function stepCombat(dt: number) {
  arms.flareCd = Math.max(0, arms.flareCd - dt)
  arms.shake = Math.max(0, arms.shake - dt * 2.2)
  stepGun(dt)
  stepHook(dt)
  stepPirateGuns(dt)
  stepNpc(dt)
  const m = useEco.getState().mission
  if (m?.mission === 'bounty') stepBounty(m)
  if (m?.mission === 'boss') stepBoss(dt)
  stepFoes(dt)
  stepShots(dt)
  stepParticles(dt)
  arms.hot = Math.max(0, arms.hot - dt)
  if (foes.some((f) => !f.dead && f.mode === 'fight') || (pirate.active && !pirate.dead && pirate.state === 'chase')) arms.hot = 3
}
// ---------------- HUD 读数 ----------------
export function combatReadout() {
  const e = useEco.getState()
  const w = e.weapons ?? { gun: 0, harpoon: 0, flare: 0 }
  const lk = arms.lock && !arms.lock.dead ? arms.lock : null
  const bf = boss.foe && !boss.foe.dead ? boss.foe : null
  const m = e.mission
  let mission: null | { kind: string; title: string; dist: number; brg: number; sub: string } = null
  if (m) {
    let tx = 0, tz = 0, sub = ''
    if (m.mission === 'escort') {
      if (npc.active) { tx = npc.pos.x; tz = npc.pos.z; sub = npc.state === 'wait' ? '商船在栈桥旁等待起航（靠近它）' : npc.halted ? '商船在等你——快跟上！' : `前往${islandName(m.to)} · 航程 ${Math.round(npc.prog * 100)}%` }
      else { const d = dockOf(m.from); tx = d.x; tz = d.z; sub = '回到委托港口与商船会合' }
    } else if (m.zone) {
      tx = m.zone[0]; tz = m.zone[1]
      const t = m.mission === 'boss' ? bf : bounty.foe && !bounty.foe.dead ? bounty.foe : null
      if (t) { tx = t.pos.x; tz = t.pos.z }
      sub = t ? `交战中：${t.name}` : m.mission === 'boss' ? '前往黑帆锚地（小地图红圈）' : '前往搜索区域（小地图红圈）'
    }
    mission = { kind: m.mission!, title: m.mission === 'escort' ? `护航 · 「${m.foe}」` : m.mission === 'bounty' ? `悬赏 · ${m.foe}` : '特别篇 · 黑帆落幕', dist: Math.hypot(tx - ship.pos.x, tz - ship.pos.z), brg: (-Math.atan2(tx - ship.pos.x, tz - ship.pos.z) * 180) / Math.PI, sub }
  }
  return {
    w,
    armed: w.gun + w.harpoon + w.flare > 0,
    heat: arms.heat,
    over: arms.over,
    firing: arms.key || arms.mouse || arms.pad,
    harpoon: arms.hook ? { state: 'hook' as const, t: arms.hookT } : arms.harp ? { state: 'fly' as const, t: 0 } : arms.harpCd > 0 ? { state: 'cd' as const, t: arms.harpCd } : { state: 'ready' as const, t: 0 },
    flares: e.flares ?? 0,
    flareCd: arms.flareCd,
    lock: lk ? { name: lk.name, hp: lk.hp, maxHp: lk.maxHp, dist: lk.pos.distanceTo(ship.pos) } : null,
    boss: bf ? { name: bf.name, hp: bf.hp, maxHp: bf.maxHp, phase: boss.phase, ram: bf.ramT > 0 } : null,
    escort: m?.mission === 'escort' && npc.active ? { name: npc.name, hp: npc.hp, prog: npc.prog, state: npc.state, halted: npc.halted, hit: npc.hitT > 0 } : null,
    mission,
    hot: arms.hot > 0,
  }
}
export type CombatReadout = ReturnType<typeof combatReadout>
export const WEAPON_LABEL: Record<WeaponId, string> = { gun: WEAPONS.gun.name, harpoon: WEAPONS.harpoon.name, flare: WEAPONS.flare.name }
export { shipCenter }

/** 调试 / 自动化测试用：直接对目标造成伤害 */
export const debugHit = (t: Target, dmg: number) => hitTarget(t, dmg)
