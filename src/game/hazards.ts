import { emit } from './events'
import * as THREE from 'three'
import { ship } from './flight'
import { env } from './env'
import { windAt, type WindSample } from './wind'
import { ISLANDS, WORLD_R, HOME_DOCK } from './world'
import { islandName, useEco } from './economy'

/**
 * 天气与威胁：雷暴云团、空贼飞艇、抛货。
 * 只在航行时由 session.tickSession 推进；渲染端（Hazards.tsx）每帧读取这里的状态。
 */

// ---------------- 雷暴 ----------------
export type Storm = { id: number; x: number; z: number; r: number; age: number; life: number; vx: number; vz: number; nextBolt: number; seed: number }
export type Bolt = { id: number; pts: THREE.Vector3[]; t: number; hit: boolean }
export const STORM_TOP = 470
const STORM_COUNT = 3
let sid = 0, bid = 0
export const storms: Storm[] = []
export const bolts: Bolt[] = []
const ws: WindSample = { x: 0, z: 0, speed: 0, zone: null }

/** 雷暴强度（淡入淡出） */
export const stormLife = (s: Storm) => Math.min(1, s.age / 30, (s.life - s.age) / 30)
/** 某点处的雷暴影响 0..1 */
export function stormAt(x: number, y: number, z: number) {
  let k = 0, best: Storm | null = null
  for (const s of storms) {
    const d = Math.hypot(x - s.x, z - s.z)
    const v = (1 - THREE.MathUtils.smoothstep(d, s.r * 0.45, s.r)) * stormLife(s) * (1 - THREE.MathUtils.smoothstep(y, STORM_TOP - 30, STORM_TOP + 30))
    if (v > k) { k = v; best = s }
  }
  return { k, storm: best }
}

function spawnStorm(initial = false) {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 1900
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    const r = 170 + Math.random() * 110
    if (Math.hypot(x - ship.pos.x, z - ship.pos.z) < r + (initial ? 700 : 450)) continue
    if (Math.hypot(x - HOME_DOCK.x, z - HOME_DOCK.z) < r + 250) continue
    const life = 300 + Math.random() * 160
    storms.push({ id: ++sid, x, z, r, age: initial ? Math.random() * 120 + 30 : 0, life, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, nextBolt: 2 + Math.random() * 4, seed: Math.random() * 100 })
    return
  }
}

/** v1.2 首领「唤来风暴」：在指定位置生成一团雷暴（替换最远的一团） */
export function summonStorm(x: number, z: number) {
  if (storms.length >= STORM_COUNT) {
    let far = 0, fd = -1
    storms.forEach((st, i) => { const d = Math.hypot(st.x - x, st.z - z); if (d > fd) { fd = d; far = i } })
    storms.splice(far, 1)
  }
  storms.push({ id: ++sid, x, z, r: 230, age: 25, life: 260, vx: 0, vz: 0, nextBolt: 2, seed: Math.random() * 100 })
}

function makeBolt(from: THREE.Vector3, to: THREE.Vector3, hit: boolean) {
  const pts: THREE.Vector3[] = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = from.clone().lerp(to, t)
    if (i > 0 && i < n) { p.x += (Math.random() - 0.5) * 22; p.z += (Math.random() - 0.5) * 22 }
    pts.push(p)
  }
  bolts.push({ id: ++bid, pts, t: 0, hit })
  if (bolts.length > 6) bolts.shift()
}

const gust = new THREE.Vector3()
let gustT = 0

function stepStorms(dt: number) {
  while (storms.length < STORM_COUNT) spawnStorm(storms.length === 0 && sid === 0)
  const e = useEco.getState()
  for (let i = storms.length - 1; i >= 0; i--) {
    const s = storms[i]
    s.age += dt
    windAt(s.x, 250, s.z, ship.time, ws)
    s.x += (ws.x * 0.7 + s.vx) * dt
    s.z += (ws.z * 0.7 + s.vz) * dt
    if (s.age > s.life || Math.hypot(s.x, s.z) > WORLD_R + 300) { storms.splice(i, 1); continue }
    const life = stormLife(s)
    s.nextBolt -= dt * (0.4 + life)
    if (s.nextBolt <= 0) {
      s.nextBolt = 3 + Math.random() * 6
      const { k } = stormAt(ship.pos.x, ship.pos.y, ship.pos.z)
      const strike = k > 0.35 && Math.random() < 0.32
      const from = new THREE.Vector3(s.x + (Math.random() - 0.5) * s.r * 0.8, 380 + Math.random() * 40, s.z + (Math.random() - 0.5) * s.r * 0.8)
      let to: THREE.Vector3
      if (strike) {
        to = ship.pos.clone()
        from.set(ship.pos.x + (Math.random() - 0.5) * 60, 400, ship.pos.z + (Math.random() - 0.5) * 60)
        const m = ship.mods
        e.damageHull(14 * (1 - m.bumpRes))
        e.damageFragile(0.12 * m.fragile)
        e.note(`遭到雷击！船体 -${Math.round(14 * (1 - m.bumpRes))}`, true)
        env.flash = 1
      } else {
        to = new THREE.Vector3(from.x + (Math.random() - 0.5) * 80, 20, from.z + (Math.random() - 0.5) * 80)
      }
      makeBolt(from, to, strike)
      const dist = Math.hypot(from.x - ship.pos.x, from.z - ship.pos.z)
      env.flash = Math.max(env.flash, Math.max(0, 1 - dist / 1400) * life)
    }
  }
  // 湍流与下沉气流
  const { k, storm } = stormAt(ship.pos.x, ship.pos.y, ship.pos.z)
  if (k > 0.01 && !ship.docked && storm) {
    gustT -= dt
    if (gustT <= 0) { gustT = 0.4 + Math.random() * 0.5; gust.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2).multiplyScalar(4.5) }
    const resist = 1 - ship.mods.bumpRes * 0.5
    ship.vel.addScaledVector(gust, k * dt * resist)
    ship.vel.y -= 2.6 * k * (0.6 + 0.4 * Math.sin(ship.time * 0.7 + storm.seed)) * dt * resist
    ship.yawRate += (Math.random() - 0.5) * 0.25 * k * dt
    ship.roll += (Math.random() - 0.5) * 0.08 * k
    if (k > 0.3) e.flagCargo('storm')
  }
}

// ---------------- 空贼 ----------------
export const PIRATE_CEIL = 300
export const PIRATE_SPEED = 14.8
export const GRAPPLE_R = 120
export const GRAPPLE_TIME = 8
export const SAFE_R = 330
export const pirate = {
  active: false,
  state: 'chase' as 'chase' | 'loot' | 'flee',
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  grapple: 0,
  chaseT: 0,
  lootT: 0,
  loot: new THREE.Vector3(),
  cooldown: 60,
  // v1.2 战斗：耐久、开炮计时、照明弹致盲、被鱼叉钩住、击落后的坠落计时
  kind: 'pirate' as const,
  name: '空贼飞艇',
  hp: 70,
  maxHp: 70,
  fireT: 10,
  blind: 0,
  hooked: false,
  dead: 0,
  flash: 0,
}
/** 照明弹诱饵位置（combat.ts 写入），被致盲的空贼会追向诱饵 */
export const lure = { active: false, pos: new THREE.Vector3() }
export type Drop = { id: number; pos: THREE.Vector3; vel: THREE.Vector3; t: number; kind: string }
export const drops: Drop[] = []
let did = 0

export const cargoValue = () => useEco.getState().cargo.reduce((a, c) => a + c.reward, 0)
/** 是否在港口安全区 */
export function inSafeZone(x: number, z: number) {
  return ISLANDS.some((i) => Math.hypot(x - i.x, z - i.z) < SAFE_R)
}

function spawnPirate() {
  const a = ship.yaw + Math.PI + (Math.random() - 0.5) * 1.6
  const d = 620
  pirate.pos.set(ship.pos.x + Math.sin(a) * d, THREE.MathUtils.clamp(ship.pos.y, 120, PIRATE_CEIL), ship.pos.z + Math.cos(a) * d)
  pirate.vel.set(0, 0, 0)
  pirate.yaw = Math.atan2(ship.pos.x - pirate.pos.x, ship.pos.z - pirate.pos.z)
  pirate.active = true
  pirate.state = 'chase'
  pirate.grapple = 0
  pirate.chaseT = 0
  pirate.hp = pirate.maxHp = 70
  pirate.fireT = 10
  pirate.blind = 0
  pirate.hooked = false
  pirate.dead = 0
  useEco.getState().note('⚠ 空贼飞艇出现在后方！加速甩开，或爬升到 340 米以上、躲进雷暴或港口安全区', true)
}

function endPirate(cool: number) {
  pirate.state = 'flee'
  pirate.cooldown = cool
}

const tv = new THREE.Vector3()
function stepPirate(dt: number) {
  const e = useEco.getState()
  if (!pirate.active) {
    pirate.cooldown -= dt
    const V = cargoValue()
    if (pirate.cooldown <= 0 && !ship.docked && e.stats.deliveries >= 2 && V >= 120 && !inSafeZone(ship.pos.x, ship.pos.z)) {
      const p = Math.min(0.02, V / 30000)
      if (Math.random() < p * dt) spawnPirate()
    }
    return
  }
  const P = pirate
  // 被击落：冒烟坠落，数秒后消失
  if (P.dead > 0) {
    P.dead += dt
    P.vel.y -= 5 * dt
    P.vel.x *= 1 - dt * 0.4; P.vel.z *= 1 - dt * 0.4
    P.pos.addScaledVector(P.vel, dt)
    P.grapple = 0
    if (P.dead > 7 || P.pos.y < 10) { P.active = false; P.dead = 0 }
    return
  }
  const dx = ship.pos.x - P.pos.x, dz = ship.pos.z - P.pos.z
  const dh = Math.hypot(dx, dz)
  const d3 = Math.hypot(dh, ship.pos.y - P.pos.y)
  const storm = stormAt(ship.pos.x, ship.pos.y, ship.pos.z).k > 0.25
  const safe = inSafeZone(ship.pos.x, ship.pos.z)
  const high = ship.pos.y > PIRATE_CEIL + 40
  let speed = PIRATE_SPEED * (P.hooked ? 0.45 : 1)
  const blind = P.blind > 0
  if (blind) {
    P.blind -= dt
    if (P.blind <= 0 && P.state === 'chase' && dh > 420) { e.note('空贼被照明弹晃花了眼，跟丢了你！', false); e.flagCargo('pirate'); emit({ t: 'pirateShaken' }); endPirate(120) }
  }
  if (P.state === 'chase' && blind && lure.active) {
    // 致盲：追向照明弹诱饵，不能放钩索
    tv.set(lure.pos.x - P.pos.x, 0, lure.pos.z - P.pos.z)
    tv.normalize().multiplyScalar(speed * 0.8)
    P.grapple = Math.max(0, P.grapple - dt * 0.5)
    P.chaseT += dt
  } else if (P.state === 'chase') {
    P.chaseT += dt
    if (safe) { e.note('空贼不敢靠近港口，悻悻离去', false); e.flagCargo('pirate'); emit({ t: 'pirateShaken' }); endPirate(120) }
    else if (P.chaseT > 150 || dh > 1050) { e.note('甩掉了空贼！', false); e.flagCargo('pirate'); emit({ t: 'pirateShaken' }); endPirate(120) }
    else if (e.cargo.length === 0) { e.note('货舱空空，空贼失去了兴趣', false); endPirate(90) }
    // 目标：船后方；对方在雷暴里或太高时在外面徘徊
    const hold = storm || high
    const want = hold ? Math.max(0, dh - 220) : dh
    // 提前量追击：瞄准玩家几秒后的位置（距离越远提前越多，贴近时直接追；不提高航速，保持公平）
    const lead = dh > 90 ? Math.min(5, dh / speed) * 0.7 : 0
    tv.set(dx + ship.vel.x * lead, 0, dz + ship.vel.z * lead).normalize().multiplyScalar(Math.min(speed, want * 0.6 + 2))
    if (!hold && d3 < GRAPPLE_R) P.grapple += dt / GRAPPLE_TIME
    else P.grapple = Math.max(0, P.grapple - dt * 0.12)
    if (P.grapple >= 1) {
      // 钩索得手：抢走最值钱的一件货
      const c = [...e.cargo].sort((a, b) => (a.story ? 1 : 0) - (b.story ? 1 : 0) || b.reward - a.reward)[0]
      if (c) e.steal(c.id)
      const dmg = 10 * (1 - ship.mods.bumpRes)
      e.damageHull(dmg)
      e.note(`空贼钩索得手！抢走了「${c?.goods ?? '货物'}」（价值 ${c?.reward ?? 0}），船体 -${Math.round(dmg)}`, true)
      ship.bump = Math.max(ship.bump, 0.5)
      P.grapple = 0
      endPirate(160)
    }
  } else if (P.state === 'loot') {
    tv.set(P.loot.x - P.pos.x, 0, P.loot.z - P.pos.z)
    const dl = tv.length()
    tv.normalize().multiplyScalar(Math.min(speed, dl * 0.5))
    P.grapple = Math.max(0, P.grapple - dt * 0.2)
    if (dl < 30) P.lootT -= dt
    if (P.lootT <= 0) {
      if (e.cargo.length && cargoValue() >= 120 && !safe) { P.state = 'chase'; P.chaseT = Math.max(0, P.chaseT - 30) }
      else { e.note('空贼捞起抛下的货物后离开了', false); endPirate(120) }
    }
  } else {
    tv.set(-dx, 0, -dz).normalize().multiplyScalar(16)
    speed = 16
    if (dh > 1300) { P.active = false; return }
  }
  windAt(P.pos.x, P.pos.y, P.pos.z, ship.time, ws)
  P.vel.x += (tv.x + ws.x * 0.5 - P.vel.x) * Math.min(1, dt * 0.6)
  P.vel.z += (tv.z + ws.z * 0.5 - P.vel.z) * Math.min(1, dt * 0.6)
  const ty = P.state === 'loot' ? Math.max(60, P.loot.y) : THREE.MathUtils.clamp(ship.pos.y, 70, PIRATE_CEIL)
  P.vel.y += (THREE.MathUtils.clamp((ty - P.pos.y) * 0.3, -2.5, 2.5) - P.vel.y) * Math.min(1, dt)
  P.pos.addScaledVector(P.vel, dt)
  // 不进入雷暴：被推出
  const sk = stormAt(P.pos.x, P.pos.y, P.pos.z)
  if (sk.storm && sk.k > 0.2) {
    const ax = P.pos.x - sk.storm.x, az = P.pos.z - sk.storm.z, L = Math.hypot(ax, az) || 1
    P.pos.x += (ax / L) * 20 * dt
    P.pos.z += (az / L) * 20 * dt
  }
  const hv = Math.hypot(P.vel.x, P.vel.z)
  if (hv > 0.5) {
    const ty2 = Math.atan2(P.vel.x, P.vel.z)
    let dy = (ty2 - P.yaw) % (Math.PI * 2)
    if (dy > Math.PI) dy -= Math.PI * 2
    if (dy < -Math.PI) dy += Math.PI * 2
    P.yaw += dy * Math.min(1, dt * 1.2)
  }
}

/** J：抛下价值最低的一件货，空贼会去捞 */
export function jettison() {
  const e = useEco.getState()
  if (!e.cargo.length) { e.note('货舱是空的'); return }
  if (ship.docked) { e.note('系泊中不能抛货'); return }
  const c = [...e.cargo].sort((a, b) => (a.story ? 1 : 0) - (b.story ? 1 : 0) || a.reward - b.reward)[0]
  e.jettison(c.id)
  drops.push({ id: ++did, pos: ship.pos.clone().add(new THREE.Vector3(0, -9, 0)), vel: ship.vel.clone().multiplyScalar(0.6), t: 0, kind: c.kind })
  if (pirate.active && pirate.state === 'chase') {
    pirate.state = 'loot'
    pirate.loot.copy(ship.pos).y -= 30
    pirate.lootT = 7
    pirate.grapple = Math.max(0, pirate.grapple - 0.5)
    e.note(`抛下「${c.goods}」——空贼掉头去捞货了！`)
  } else e.note(`抛下了「${c.goods}」（${islandName(c.from)}声望 -2）`, true)
}

function stepDrops(dt: number) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]
    d.t += dt
    d.vel.y -= 9.8 * dt
    d.vel.multiplyScalar(1 - dt * 0.2)
    d.pos.addScaledVector(d.vel, dt)
    if (d.pos.y < 10 || d.t > 20) drops.splice(i, 1)
  }
}

/** 每帧推进（仅航行中） */
export function stepHazards(dt: number) {
  stepStorms(dt)
  stepPirate(dt)
  stepDrops(dt)
}
/** 视觉衰减（任何界面下都推进，避免闪光卡住） */
export function decayFx(dt: number) {
  env.flash = Math.max(0, env.flash - dt * 2.5)
  for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t > 0.45) bolts.splice(i, 1) }
}

/** 新航程：清空天气与空贼 */
export function resetHazards() {
  storms.length = 0
  bolts.length = 0
  drops.length = 0
  pirate.active = false; pirate.dead = 0; pirate.hooked = false; pirate.blind = 0; lure.active = false
  pirate.cooldown = 60
  sid = 0
}

/** HUD 读数 */
export function hazardReadout() {
  let near: { d: number; k: number } | null = null
  for (const s of storms) {
    const d = Math.hypot(ship.pos.x - s.x, ship.pos.z - s.z) - s.r
    if (!near || d < near.d) near = { d, k: 0 }
  }
  const { k } = stormAt(ship.pos.x, ship.pos.y, ship.pos.z)
  if (near) near.k = k
  const P = pirate
  return {
    storm: near,
    pirate: P.active && !P.dead ? { dist: P.pos.distanceTo(ship.pos), grapple: P.grapple, state: P.state, high: ship.pos.y > PIRATE_CEIL + 40, hp: P.hp, maxHp: P.maxHp, blind: P.blind > 0 } : null,
    fog: env.fog,
  }
}
