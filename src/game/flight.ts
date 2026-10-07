import { useSettings } from './settings'
import * as THREE from 'three'
import { BOXES, CYLS, DOCKS, HOME_DOCK, ISLANDS, LOW_WARN, SINK_Y, WALL, boundsCheck, frostK, nearestIsland, type Dock, type IslandDef } from './world'
import { COLD_COAL, COLD_COAL_KIT, LARGE_PORTS_TEXT } from './hulls'
import type { Controls } from './input'
import { FUEL, coalRate, waterRate } from './fuel'
import { windAt, type WindSample } from './wind'
import { DEFAULT_LEVELS, shipMods } from './upgrades'

/**
 * 蒸汽飞艇飞行模型。
 * 三套独立操纵：
 *  - 升力：锅炉压力（气囊加热）决定浮力，约 50% 为中性浮力；压力目标立即改变，实际压力有滞后。
 *  - 推进：螺旋桨档位 -1..4，桨速缓慢追随档位，推力对抗线性 + 二次阻力。
 *  - 方向舵：舵角缓动，偏航有惯性与阻尼；低速时舵效降低。
 */
export const PHYS = {
  /** 浮力系数：(压力 - 0.5) × lift = 垂直加速度 m/s² */
  lift: 7,
  /** 垂直阻尼 1/s */
  vDrag: 0.55,
  /** 压力向目标收敛的比例系数与最大速率（每秒） */
  pressGain: 0.9,
  pressMaxRate: 0.12,
  /** 按住升降键时压力目标的变化速率（每秒） */
  targetRate: 0.35,
  /** 满档推力 m/s² */
  thrust: 1.8,
  linDrag: 0.04,
  quadDrag: 0.005,
  /** 侧向阻尼（龙骨效应） */
  latDrag: 0.9,
  /** 桨速变化速率（每秒） */
  propRate: 0.3,
  /** 舵角变化速率 */
  rudderRate: 1.8,
  rudderAcc: 0.32,
  yawDamp: 0.9,
}

export const GEAR_MIN = -1
export const GEAR_MAX = 4
export const GEAR_NAMES: Record<string, string> = { '-1': '倒车', '0': '停车', '1': '微速', '2': '半速', '3': '巡航', '4': '全速' }
const propTarget = (g: number) => (g < 0 ? -0.45 : g / GEAR_MAX)

export const ship = {
  pos: new THREE.Vector3(HOME_DOCK.x, HOME_DOCK.y, HOME_DOCK.z),
  vel: new THREE.Vector3(),
  yaw: HOME_DOCK.yaw,
  yawRate: 0,
  /** 实际锅炉压力 0..1 */
  pressure: 0.5,
  /** 压力目标 0..1 */
  target: 0.5,
  gear: 0,
  /** 实际桨速 -0.45..1 */
  prop: 0,
  propAngle: 0,
  /** 舵角 -1..1 */
  rudder: 0,
  roll: 0,
  pitch: 0,
  time: 0,
  /** 是否系泊 */
  docked: true,
  /** 当前（或最近一次）系泊点 */
  dock: HOME_DOCK as Dock,
  /** 煤 / 水 0..1 */
  coal: 1,
  water: 1,
  /** 正在补给 */
  refilling: false,
  /** 当前风 */
  wind: { x: 0, z: 0, speed: 0, zone: null } as WindSample,
  sinkTimer: 0,
  /** 碰撞闪烁 0..1 */
  bump: 0,
  /** 刚刚复位的提示计时 */
  respawnMsg: 0,
  /** 货物总重（吨） */
  load: 0,
  /** 改装参数 */
  mods: shipMods(DEFAULT_LEVELS),
  /** 船体耐久为 0：推力受限 */
  wrecked: false,
  /** v1.2 气囊破洞数（来自存档）与当前漏气量（额外所需压力 0..0.2，随时间逐渐变大） */
  holes: 0,
  leak: 0,
  /** 被鱼叉拖拽时的额外阻力 0..1 */
  tow: 0,
  /** v1.3 防寒锅炉罩（来自存档）、当前寒冷程度 0..1 */
  coldKit: false,
  cold: 0,
  /** 风墙阻挡原因（HUD 用） */
  wall: null as string | null,
}

/** 载重对浮力 / 惯性 / 煤耗的影响 */
export const LOAD = { lift: 0.026, mass: 0.06, thrust: 0.012, coal: 0.00008 }
/** 当前载重下的中性浮力压力 */
export const neutralPressure = () => Math.min(0.97, 0.5 + ship.mods.baseNeed + ship.load * ship.mods.loadLift + ship.leak)
/** 系泊点高度（巨型运输舰停得高一点） */
export const dockY = (D: Dock) => D.y + ship.mods.dockDy
/** 当前船体能否停靠该栈桥 */
export const canBerth = (D: Dock) => !ship.mods.bigOnly || !!D.island.large
/** 穿越风墙所需气囊等级说明（按船体） */
export const wallNeed = () => ship.mods.hull === 'giant' ? '巨型运输舰需气囊 Lv4' : ship.mods.hull === 'light' ? '轻型快艇需气囊 Lv2' : '标准货船需气囊 Lv3；轻型快艇 Lv2 即可'
/** 霜原耗煤倍率 */
export const coldMul = () => 1 + (ship.coldKit ? COLD_COAL_KIT - 1 : COLD_COAL - 1) * ship.cold

/** 事件钩子（由经济系统订阅） */
export const shipEvents: { onImpact: ((speed: number) => void) | null } = { onImpact: null }

export function resetShip(msg = false) {
  placeAtDock(HOME_DOCK, 1, 1, msg)
}
/** 把飞艇系泊到指定栈桥 */
export function placeAtDock(D: Dock, coal: number, water: number, msg = false) {
  ship.pos.set(D.x, dockY(D), D.z)
  ship.vel.set(0, 0, 0)
  ship.yaw = D.yaw
  ship.dock = D
  ship.coal = coal
  ship.water = water
  ship.refilling = false
  ship.yawRate = 0
  ship.pressure = ship.target = neutralPressure()
  ship.gear = 0
  ship.prop = 0
  ship.rudder = 0
  ship.roll = ship.pitch = 0
  ship.docked = true
  ship.sinkTimer = 0
  ship.bump = 0
  ship.respawnMsg = msg ? 4 : 0
}

export function shiftGear(d: number) {
  ship.gear = THREE.MathUtils.clamp(ship.gear + d, GEAR_MIN, GEAR_MAX)
}
export function neutralTrim() {
  ship.target = neutralPressure()
}

/**
 * 靠泊判定（1.0.1 放宽）：
 * - 距离只算水平距离（以栈桥旁的系泊点为准），≤ DOCK_RANGE 米；
 * - 高度窗口：系泊点下方 DOCK_BELOW 米 ~ 上方 DOCK_ABOVE 米；
 * - 速度用「对地速度」与「空速」中较小的一个（侧风漂移不再导致无法靠泊），只算水平分量，≤ DOCK_SPEED。
 */
export const DOCK_RANGE = 90
export const DOCK_ABOVE = 60
export const DOCK_BELOW = 25
/** 米/秒（约 12 节） */
export const DOCK_SPEED = 6.2
/** 最近的系泊点（按水平距离） */
export function nearestDock() {
  let best = DOCKS[0], bd = Infinity
  for (const d of DOCKS) {
    const dist = Math.hypot(ship.pos.x - d.x, ship.pos.z - d.z)
    if (dist < bd) { bd = dist; best = d }
  }
  return { dock: best, dist: bd }
}
export type DockCheck = { dock: Dock; dist: number; dy: number; speed: number; ok: boolean; reason: string | null }
/** 靠泊条件检查：ok=true 可按 E；否则 reason 说明原因（太远 / 太高 / 太低 / 太快） */
export function dockCheck(): DockCheck {
  const { dock, dist } = nearestDock()
  const dy = ship.pos.y - dockY(dock)
  const ground = Math.hypot(ship.vel.x, ship.vel.z)
  const air = Math.hypot(ship.vel.x - ship.wind.x, ship.vel.z - ship.wind.z)
  const speed = Math.min(ground, air)
  let reason: string | null = null
  if (dist <= DOCK_RANGE * 2.5 && !canBerth(dock)) reason = `巨型运输舰无法停靠${dock.island.name}（栈桥太小）· 只能停靠大型港口：${LARGE_PORTS_TEXT}`
  else if (dist > DOCK_RANGE) reason = `距离栈桥 ${Math.round(dist)} 米，需在 ${DOCK_RANGE} 米内`
  else if (dy > DOCK_ABOVE) reason = `太高了（高出栈桥 ${Math.round(dy)} 米），请降低锅炉压力下降`
  else if (dy < -DOCK_BELOW) reason = `太低了（低于栈桥 ${Math.round(-dy)} 米），请提高锅炉压力上升`
  else if (speed > DOCK_SPEED) reason = `太快了（${(speed * 1.944).toFixed(1)} 节），减速到 ${Math.round(DOCK_SPEED * 1.944)} 节以下`
  return { dock, dist, dy, speed, ok: !ship.docked && !reason, reason }
}
/** E 键：满足条件时系泊，返回系泊点 */
export function tryDock(): Dock | null {
  if (ship.docked) return null
  const c = dockCheck()
  if (!c.ok) return null
  ship.docked = true
  ship.dock = c.dock
  ship.gear = 0
  ship.target = neutralPressure()
  return c.dock
}
/** 按水平距离最近的系泊点（拖船用；巨型运输舰只算大型港口） */
export function nearestDockFlat() {
  let best = DOCKS[0], bd = Infinity
  for (const d of DOCKS) {
    if (!canBerth(d)) continue
    const dist = Math.hypot(ship.pos.x - d.x, ship.pos.z - d.z)
    if (dist < bd) { bd = dist; best = d }
  }
  return { dock: best, dist: bd }
}

/** 飞艇碰撞球（局部坐标，船头 +Z） */
const PROBES: { o: THREE.Vector3; r: number }[] = [
  { o: new THREE.Vector3(0, 0, 0), r: 4.6 },
  { o: new THREE.Vector3(0, 0, 7.5), r: 3.4 },
  { o: new THREE.Vector3(0, 0, -7.5), r: 3.4 },
  { o: new THREE.Vector3(0, -8.2, 1), r: 2.0 },
  { o: new THREE.Vector3(0, -8.2, -3.5), r: 1.8 },
]

const n = new THREE.Vector3()
const tmp = new THREE.Vector3()
const push = new THREE.Vector3()
const fwd = new THREE.Vector3()
const right = new THREE.Vector3()

/** 浮空岛：顶面 + 向下收窄的岩锥 */
function islandPen(p: THREE.Vector3, r: number, isl: IslandDef, out: THREE.Vector3): number {
  const dx = p.x - isl.x, dz = p.z - isl.z
  const d = Math.hypot(dx, dz)
  const bottom = isl.top - isl.depth
  if (p.y < bottom - r || d > isl.R + r) return 0
  if (p.y >= isl.top) {
    if (d < isl.R && p.y < isl.top + r) { out.set(0, 1, 0); return isl.top + r - p.y }
    return 0
  }
  const k = THREE.MathUtils.clamp((p.y - bottom) / isl.depth, 0, 1)
  const ar = isl.R * Math.pow(k, 0.75)
  const side = ar + r - d
  if (side <= 0) return 0
  const up = isl.top + r - p.y
  if (up < side) { out.set(0, 1, 0); return up }
  if (d < 1e-3) out.set(1, 0, 0)
  else out.set(dx / d, 0, dz / d)
  return side
}

function boxPen(p: THREE.Vector3, r: number, b: (typeof BOXES)[number], out: THREE.Vector3): number {
  const pen: [number, THREE.Vector3Tuple][] = [
    [p.x - (b.min[0] - r), [-1, 0, 0]], [b.max[0] + r - p.x, [1, 0, 0]],
    [p.y - (b.min[1] - r), [0, -1, 0]], [b.max[1] + r - p.y, [0, 1, 0]],
    [p.z - (b.min[2] - r), [0, 0, -1]], [b.max[2] + r - p.z, [0, 0, 1]],
  ]
  let best = Infinity, dir: THREE.Vector3Tuple = [0, 1, 0]
  for (const [v, d] of pen) { if (v <= 0) return 0; if (v < best) { best = v; dir = d } }
  out.set(...dir)
  return best
}

function cylPen(p: THREE.Vector3, r: number, c: (typeof CYLS)[number], out: THREE.Vector3): number {
  if (p.y < c.y0 - r || p.y > c.y1 + r) return 0
  const dx = p.x - c.x, dz = p.z - c.z
  const d = Math.hypot(dx, dz)
  const side = c.r + r - d
  if (side <= 0) return 0
  const up = c.y1 + r - p.y
  if (up < side) { out.set(0, 1, 0); return up }
  out.set(d < 1e-3 ? 1 : dx / d, 0, d < 1e-3 ? 0 : dz / d)
  return side
}

/** 计算整船的推出向量（各探针取最大穿透） */
function collide(): number {
  push.set(0, 0, 0)
  let maxPen = 0
  for (const pr of PROBES) {
    const sc = ship.mods.scale
    tmp.copy(pr.o).multiplyScalar(sc).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ship.yaw).add(ship.pos)
    const test = (pen: number) => {
      if (pen > 0) {
        if (pen > maxPen) maxPen = pen
        // 每个轴取最大分量，避免多个探针重复叠加
        const v = n.clone().multiplyScalar(pen)
        if (Math.abs(v.x) > Math.abs(push.x)) push.x = v.x
        if (Math.abs(v.y) > Math.abs(push.y)) push.y = v.y
        if (Math.abs(v.z) > Math.abs(push.z)) push.z = v.z
      }
    }
    const r = pr.r * sc
    for (const isl of ISLANDS) test(islandPen(tmp, r, isl, n))
    for (const b of BOXES) test(boxPen(tmp, r, b, n))
    for (const c of CYLS) test(cylPen(tmp, r, c, n))
  }
  return maxPen
}

/** 推进一步物理。返回 'respawn' 表示刚因沉入云海复位 */
export function stepShip(dt: number, c: Controls): 'sink' | null {
  const s = ship
  s.time += dt
  // 漏气：每个破洞让中性浮力所需压力逐渐增加（修补后立即恢复）
  const lt = Math.min(0.2, s.holes * 0.035)
  s.leak = lt < s.leak ? lt : s.docked ? s.leak : Math.min(lt, s.leak + 0.0025 * dt)
  // --- 升力：压力目标 → 实际压力（滞后）
  s.target = THREE.MathUtils.clamp(s.target + c.lift * PHYS.targetRate * dt, 0, 1)
  // 缺水：压力上限降低；断煤：锅炉熄火，压力缓慢衰减
  const effTarget = s.water > 0 ? s.target : Math.min(s.target, FUEL.noWaterCap)
  if (s.coal > 0) {
    const dp = THREE.MathUtils.clamp((effTarget - s.pressure) * PHYS.pressGain, -s.mods.pressRate, s.mods.pressRate)
    s.pressure = THREE.MathUtils.clamp(s.pressure + dp * dt, 0, 1)
  } else {
    s.pressure = Math.max(0, s.pressure - FUEL.noCoalDecay * dt)
  }
  if (s.water <= 0 && s.pressure > FUEL.noWaterCap) s.pressure = Math.max(FUEL.noWaterCap, s.pressure - s.mods.pressRate * dt)
  // 蒸汽供给系数：断煤后桨力随压力下降
  const steam = s.coal > 0 ? (s.water > 0 ? 1 : 0.6) : THREE.MathUtils.clamp(s.pressure / 0.5, 0, 1) * 0.5

  // 解缆：一旦动档或调压，离开系泊状态
  const neutral = neutralPressure()
  const mf = 1 + s.load * LOAD.mass
  if (s.docked && (s.gear !== 0 || Math.abs(s.target - neutral) > 0.04)) s.docked = false

  // 接近升限时空气稀薄，浮力衰减
  const ceil = s.mods.ceiling
  const thin = 1 - 0.5 * THREE.MathUtils.smoothstep(s.pos.y, ceil - 90, ceil)
  let ay = ((s.pressure * thin - neutral) * s.mods.lift) / Math.sqrt(mf) - s.vel.y * PHYS.vDrag
  // 气流造成的轻微起伏
  ay += Math.sin(s.time * 0.6) * 0.15 + Math.sin(s.time * 1.37 + 1.3) * 0.07

  // --- 推进
  const pt = propTarget(s.gear) * steam
  s.prop += THREE.MathUtils.clamp(pt - s.prop, -s.mods.propRate * dt, s.mods.propRate * dt)
  s.propAngle += s.prop * dt * 22 + dt * 1.2 * Math.sign(s.prop || 0)
  fwd.set(Math.sin(s.yaw), 0, Math.cos(s.yaw))
  right.set(-Math.cos(s.yaw), 0, Math.sin(s.yaw))
  // 风：阻力作用于相对空气的速度，因此飞艇会随风漂移
  windAt(s.pos.x, s.pos.y, s.pos.z, s.time, s.wind)
  const wx = s.docked ? 0 : s.wind.x, wz = s.docked ? 0 : s.wind.z
  const ax0 = s.vel.x - wx, az0 = s.vel.z - wz
  const vF = ax0 * fwd.x + az0 * fwd.z
  const vL = ax0 * right.x + az0 * right.z
  const aF = (s.prop * s.mods.thrust * (s.wrecked ? 0.6 : 1) * (1 - s.load * LOAD.thrust) - Math.sign(vF) * (PHYS.linDrag * Math.abs(vF) + PHYS.quadDrag * vF * vF)) / mf
  const aL = -vL * PHYS.latDrag

  // --- 方向舵
  const ts = useSettings.getState().turnSens
  s.rudder += THREE.MathUtils.clamp(c.rudder - s.rudder, -PHYS.rudderRate * ts * dt, PHYS.rudderRate * ts * dt)
  const eff = 0.25 + 0.75 * Math.min(1, Math.abs(vF) / 10) + 0.25 * Math.abs(s.prop)
  const dirSign = vF < -0.5 ? -1 : 1
  s.yawRate += ((s.rudder * PHYS.rudderAcc * s.mods.turn * (0.55 + 0.45 * ts) * eff * dirSign) / mf - s.yawRate * PHYS.yawDamp) * dt
  s.yaw += s.yawRate * dt

  s.vel.addScaledVector(fwd, aF * dt).addScaledVector(right, aL * dt)
  if (s.tow > 0) { s.vel.x *= 1 - s.tow * 0.35 * dt; s.vel.z *= 1 - s.tow * 0.35 * dt }
  s.vel.y += ay * dt

  // 系泊缆绳：轻柔地把船拉回泊位并摆正船头
  if (s.docked) {
    const D = s.dock
    // 1.0.1：允许在 90 米外靠泊，缆绳以限速把船收进泊位；若低于泊位先升高再横移，避免蹭到岛体
    const ex = D.x - s.pos.x, ez = D.z - s.pos.z
    const hd = Math.hypot(ex, ez)
    // 远处先保持在泊位上方一定高度横移，靠近后再下降到泊位
    const ey = dockY(D) + Math.min(16, hd * 0.6) - s.pos.y
    const hMax = ey > 4 ? 1.5 : 6
    const hv = Math.min(hMax, hd * 0.6)
    const tvx = hd > 0.01 ? (ex / hd) * hv : 0, tvz = hd > 0.01 ? (ez / hd) * hv : 0
    const tvy = THREE.MathUtils.clamp(ey * 0.4, -4, 4)
    s.vel.x += (tvx - s.vel.x) * Math.min(1, 1.2 * dt)
    s.vel.z += (tvz - s.vel.z) * Math.min(1, 1.2 * dt)
    s.vel.y += (tvy - s.vel.y) * Math.min(1, 0.9 * dt)
    let dy = (D.yaw - s.yaw) % (Math.PI * 2)
    if (dy > Math.PI) dy -= Math.PI * 2
    if (dy < -Math.PI) dy += Math.PI * 2
    s.yawRate += (dy * 0.5 - s.yawRate * 0.8) * dt
  }

  // 航区边界：外缘的回旋气流把飞艇推回（v1.3：云港圆 ∪ 风墙走廊 ∪ 霜原圆）
  const bc = boundsCheck(s.pos.x, s.pos.z)
  if (bc.over > 0) {
    const k = bc.over * 0.02 + 0.5
    const bx = bc.cx - s.pos.x, bz = bc.cz - s.pos.z, bl = Math.hypot(bx, bz) || 1
    s.vel.x += (bx / bl) * k * dt
    s.vel.z += (bz / bl) * k * dt
  }
  // v1.3 强风墙：升限不足或低于高空通道时，额外的乱流把飞艇推回来时的一侧
  s.wall = null
  if (s.pos.z > WALL.z0 - 60 && s.pos.z < WALL.z1 + 60 && Math.abs(s.pos.x) < WALL.x + 200 && !s.docked) {
    const ceilOk = s.mods.ceiling >= WALL.ceil
    const high = s.pos.y >= WALL.alt - 8
    if (!ceilOk || !high) {
      const mid = (WALL.z0 + WALL.z1) / 2
      const side = s.pos.z < mid ? -1 : 1
      const depth = 1 - Math.abs(s.pos.z - mid) / ((WALL.z1 - WALL.z0) / 2 + 60)
      s.vel.z += side * (2.5 + 5 * Math.max(0, depth)) * dt
      s.wall = !ceilOk ? `强风墙！升限只有 ${s.mods.ceiling} 米，需要 ${WALL.ceil} 米以上才能穿越（${wallNeed()}）` : `强风墙！爬升到 ${WALL.alt} 米以上的高空通道才能穿越（当前 ${Math.round(s.pos.y)} 米）`
    } else s.wall = `正在穿越强风墙高空通道 · 保持 ${WALL.alt} 米以上`
  }
  s.cold = frostK(s.pos.z)

  // --- 煤水消耗与补给
  // 系泊时锅炉压火：只耗极少的煤水
  const burnK = s.docked ? 0.15 : 1
  s.coal = Math.max(0, s.coal - (coalRate(s.pressure * (s.coal > 0 ? 1 : 0), s.coal > 0 ? s.prop : 0) + s.load * LOAD.coal) * s.mods.coalMul * coldMul() * burnK * dt)
  s.water = Math.max(0, s.water - (s.coal > 0 ? waterRate(s.pressure, s.prop) : 0) * burnK * dt)

  s.pos.addScaledVector(s.vel, dt)

  // 硬升限
  if (s.pos.y > ceil + 12) { s.pos.y = ceil + 12; if (s.vel.y > 0) s.vel.y = 0 }

  // --- 碰撞（软反弹）
  const pen = collide()
  if (pen > 0) {
    s.pos.addScaledVector(push, Math.min(1, 12 * dt) + 0.1)
    n.copy(push).normalize()
    const vn = s.vel.dot(n)
    if (vn < 0) {
      s.vel.addScaledVector(n, -vn * 1.35)
      if (vn < -1.5) {
        s.bump = Math.min(1, s.bump + Math.min(1, -vn / 6))
        shipEvents.onImpact?.(-vn)
      }
    }
    s.vel.multiplyScalar(1 - Math.min(1, 1.5 * dt))
    s.yawRate *= 1 - Math.min(1, 2 * dt)
  }
  s.bump = Math.max(0, s.bump - dt * 1.5)
  s.respawnMsg = Math.max(0, s.respawnMsg - dt)

  // --- 姿态（仅视觉）：转弯外倾、加速抬头、升降俯仰
  const rollT = THREE.MathUtils.clamp(s.yawRate * vF * 0.035, -0.16, 0.16)
  const pitchT = THREE.MathUtils.clamp(-aF * 0.035 - s.vel.y * 0.012, -0.1, 0.1)
  s.roll += (rollT - s.roll) * Math.min(1, dt * 1.5)
  s.pitch += (pitchT - s.pitch) * Math.min(1, dt * 1.2)

  // --- 云海
  if (s.pos.y < SINK_Y) {
    s.sinkTimer += dt
    if (s.sinkTimer > 3) { s.sinkTimer = 0; return 'sink' }
  } else s.sinkTimer = Math.max(0, s.sinkTimer - dt * 2)
  return null
}

/** HUD 读数 */
export function shipReadout() {
  const s = ship
  fwd.set(Math.sin(s.yaw), 0, Math.cos(s.yaw))
  const hs = Math.hypot(s.vel.x, s.vel.z)
  const heading = ((-s.yaw * 180) / Math.PI % 360 + 360) % 360
  const warns: string[] = []
  const bc = boundsCheck(s.pos.x, s.pos.z)
  if (s.sinkTimer > 0 && s.pos.y < SINK_Y + 2) warns.push(`坠入云海！${Math.max(0, 3 - s.sinkTimer).toFixed(1)} 秒后拖船将拖回最近港口`)
  else if (s.pos.y < LOW_WARN) warns.push('高度过低 · 请提高锅炉压力')
  else if (s.pos.y > s.mods.ceiling - 30) warns.push('接近升限 · 空气稀薄，浮力下降')
  if (s.coal <= 0) warns.push('煤舱已空！锅炉熄火，飞艇正在下沉')
  else if (s.coal < FUEL.low) warns.push('燃煤不足 · 请尽快靠港补给')
  if (s.leak > 0.004) warns.push(`气囊漏气（破洞 ${s.holes} 处）· 维持浮力需额外 ${Math.round(s.leak * 100)}% 压力 · 靠港修补`)
  if (s.water <= 0) warns.push('水箱已空！锅炉压力受限')
  else if (s.water < FUEL.low) warns.push('锅炉用水不足')
  if (s.wall) warns.push(s.wall)
  else if (Math.abs(s.pos.x) < WALL.x + 200 && !s.docked) {
    const toS = WALL.z0 - s.pos.z, toN = s.pos.z - WALL.z1
    const d = toS > 0 && toS < 380 ? toS : toN > 0 && toN < 380 ? toN : -1
    if (d > 0) warns.push(s.mods.ceiling < WALL.ceil ? `前方 ${Math.round(d)} 米：强风墙 · 你的升限 ${s.mods.ceiling} 米不足 ${WALL.ceil} 米，无法穿越（${wallNeed()}）` : s.pos.y < WALL.alt ? `前方 ${Math.round(d)} 米：强风墙 · 爬升到 ${WALL.alt} 米以上从高空通道穿越` : `前方 ${Math.round(d)} 米：强风墙高空通道 · 保持高度即可穿越`)
  }
  if (bc.over > -200) warns.push('即将离开群岛航区 · 外缘乱流会把飞艇推回')
  const ni = nearestIsland(s.pos.x, s.pos.z)
  const nd = nearestDock()
  const dc = dockCheck()
  const burn = (coalRate(s.pressure, s.prop) + s.load * LOAD.coal) * s.mods.coalMul * coldMul()
  // 风相对船头：前向分量 > 0 为顺风
  const wF = s.wind.x * fwd.x + s.wind.z * fwd.z
  const wR = s.wind.x * -Math.cos(s.yaw) + s.wind.z * Math.sin(s.yaw)
  return {
    speed: hs * 1.944, // 节
    forward: s.vel.dot(fwd),
    alt: s.pos.y,
    vs: s.vel.y,
    heading,
    gear: s.gear,
    prop: s.prop,
    pressure: s.pressure,
    target: s.target,
    rudder: s.rudder,
    docked: s.docked,
    warns,
    coal: s.coal,
    water: s.water,
    endurance: s.coal > 0 ? s.coal / burn : 0,
    load: s.load,
    ceiling: s.mods.ceiling,
    wrecked: s.wrecked,
    neutral: neutralPressure(),
    refilling: s.refilling,
    wind: { speed: s.wind.speed, fwd: wF, right: wR, zone: s.wind.zone },
    nearest: ni,
    canDock: dc.ok ? nd.dock.island.name : null,
    nearDock: !s.docked && nd.dist < DOCK_RANGE * 2.5 ? nd.dock.island.name : null,
    dockReason: !s.docked && nd.dist < DOCK_RANGE * 2.5 ? dc.reason : null,
    dockName: s.dock.island.name,
    x: s.pos.x,
    z: s.pos.z,
    yaw: s.yaw,
    bump: s.bump,
    respawnMsg: s.respawnMsg,
    cold: s.cold,
    coldPct: Math.round((coldMul() - 1) * 100),
    coldKit: s.coldKit,
  }
}
export type Readout = ReturnType<typeof shipReadout>
