import { ship } from './flight'
import { windAt, type WindSample } from './wind'
import { dockOf, islandName, useEco } from './economy'

/**
 * 航线辅助：对最近的交货目的地，在若干高度层上沿航线采样风场，
 * 估算「巡航时间 + 爬升 / 下降时间」，选出最快的巡航高度。
 */
export type RouteAdvice = {
  dest: string
  destName: string
  dist: number
  /** 建议巡航高度 */
  alt: number
  /** 该高度沿航线的平均顺风分量（米/秒，正 = 顺风） */
  tail: number
  /** 当前高度的平均顺风分量 */
  curTail: number
  /** 相比保持当前高度节省的时间（秒） */
  save: number
  /** 建议高度上各段顺风分量（小地图着色用） */
  seg: { x: number; z: number; tail: number }[]
  /** 航线方向（单位向量） */
  dir: [number, number]
}

const ws: WindSample = { x: 0, z: 0, speed: 0, zone: null }
/** 估算巡航对空速度（米/秒），约等于三档巡航 */
const CRUISE = 11
/** 估算升降速度（米/秒） */
const CLIMB = 2.4
const N = 12

export const route: { advice: RouteAdvice | null; at: number } = { advice: null, at: -1 }

export function nearestDest(): string | null {
  const cargo = useEco.getState().cargo
  let best: string | null = null, bd = Infinity
  for (const c of cargo) {
    const d = dockOf(c.to)
    const dist = Math.hypot(d.x - ship.pos.x, d.z - ship.pos.z)
    if (dist < bd) { bd = dist; best = c.to }
  }
  return best
}

function tailAt(alt: number, x0: number, z0: number, dx: number, dz: number, dist: number, out?: RouteAdvice['seg']) {
  let sum = 0
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N
    const x = x0 + dx * dist * f, z = z0 + dz * dist * f
    windAt(x, alt, z, ship.time, ws)
    const t = ws.x * dx + ws.z * dz
    sum += t
    out?.push({ x, z, tail: t })
  }
  return sum / N
}

/** 计算建议（较便宜：约 30 个高度 × 12 个采样点） */
export function computeRoute(): RouteAdvice | null {
  const dest = nearestDest()
  if (!dest) return (route.advice = null)
  const d = dockOf(dest)
  const x0 = ship.pos.x, z0 = ship.pos.z
  const dist = Math.hypot(d.x - x0, d.z - z0)
  const dx = (d.x - x0) / (dist || 1), dz = (d.z - z0) / (dist || 1)
  const lo = 70, hi = Math.min(ship.mods.ceiling - 25, 470)
  const cost = (alt: number, tail: number) => dist / Math.max(3, CRUISE + tail) + (Math.abs(alt - ship.pos.y) + Math.abs(alt - d.y)) / CLIMB
  const curTail = tailAt(ship.pos.y, x0, z0, dx, dz, dist)
  const curCost = cost(ship.pos.y, curTail)
  let best = ship.pos.y, bestTail = curTail, bestCost = curCost
  for (let alt = lo; alt <= hi; alt += 15) {
    const t = tailAt(alt, x0, z0, dx, dz, dist)
    const c = cost(alt, t)
    if (c < bestCost - 1) { bestCost = c; best = alt; bestTail = t }
  }
  // 与当前高度相差不大时就建议保持
  if (Math.abs(best - ship.pos.y) < 20) { best = ship.pos.y; bestTail = curTail; bestCost = curCost }
  const seg: RouteAdvice['seg'] = []
  tailAt(best, x0, z0, dx, dz, dist, seg)
  route.advice = { dest, destName: islandName(dest), dist, alt: Math.round(best / 5) * 5, tail: bestTail, curTail, save: Math.max(0, curCost - bestCost), seg, dir: [dx, dz] }
  return route.advice
}

export function tailLabel(t: number) {
  if (t > 0.8) return `顺风 +${t.toFixed(1)} 米/秒`
  if (t < -0.8) return `逆风 ${t.toFixed(1)} 米/秒（已是最小）`
  return '侧风 / 微风'
}
