/**
 * 风场：全局微风 + 若干区域性气流带。
 * 每条气流带有中心、半径、高度层、方向与强度，并随时间缓慢摆动。
 * 方向用世界坐标向量表示（x, z），单位 米/秒。
 */
import { WALL } from './world'

export type Current = {
  id: string
  name: string
  x: number
  z: number
  r: number
  /** 高度层 [y0, y1]，两端各有 40 米过渡 */
  y0: number
  y1: number
  /** 基础风向（弧度，按 three.js 约定：(sin a, cos a) 为吹去的方向） */
  dir: number
  strength: number
  phase: number
}

export const CURRENTS: Current[] = [
  { id: 'jet', name: '北境急流', x: -400, z: 1000, r: 950, y0: 210, y1: 430, dir: -Math.PI / 2, strength: 9, phase: 0 },
  { id: 'south', name: '南环流', x: 500, z: -1050, r: 820, y0: 50, y1: 210, dir: Math.PI / 2 + 0.3, strength: 6.5, phase: 1.7 },
  { id: 'gorge', name: '峡口风', x: -1350, z: 400, r: 520, y0: 40, y1: 330, dir: 0.15, strength: 7.5, phase: 3.1 },
  { id: 'east', name: '东岸下行风', x: 1350, z: 450, r: 650, y0: 40, y1: 300, dir: Math.PI + 0.2, strength: 5.5, phase: 4.4 },
]

/** 全局微风基础方向 */
const BREEZE_DIR = -Math.PI / 2 + 0.4

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function currentDir(c: Current, t: number) {
  return c.dir + Math.sin(t * 0.011 + c.phase) * 0.35
}
export function currentStrength(c: Current, t: number) {
  return c.strength * (0.75 + 0.25 * Math.sin(t * 0.017 + c.phase * 1.3))
}
/** 某点处一条气流带的权重 0..1 */
export function currentWeight(c: Current, x: number, y: number, z: number) {
  const d = Math.hypot(x - c.x, z - c.z) / c.r
  if (d >= 1) return 0
  const radial = 1 - smooth(0.55, 1, d)
  const alt = smooth(c.y0 - 40, c.y0, y) * (1 - smooth(c.y1, c.y1 + 40, y))
  return radial * alt
}

export type WindSample = { x: number; z: number; speed: number; zone: string | null }

/** 采样风场。t 为游戏时间（秒） */
export function windAt(x: number, y: number, z: number, t: number, out: WindSample = { x: 0, z: 0, speed: 0, zone: null }): WindSample {
  const altK = 0.6 + 0.4 * Math.min(1.6, Math.max(0, y) / 300)
  const ba = BREEZE_DIR + Math.sin(t * 0.0045) * 0.6
  const bs = (2 + Math.sin(t * 0.007 + 1) * 0.8) * altK
  let wx = Math.sin(ba) * bs, wz = Math.cos(ba) * bs
  let best = 0.25
  out.zone = null
  for (const c of CURRENTS) {
    const w = currentWeight(c, x, y, z)
    if (w <= 0) continue
    const a = currentDir(c, t), s = currentStrength(c, t) * w
    wx += Math.sin(a) * s
    wz += Math.cos(a) * s
    if (w > best) { best = w; out.zone = c.name }
  }
  // v1.3 强风墙：高空通道（WALL.alt 以上）以下吹着向外的狂风——南半边吹向南，北半边吹向北
  const ww = wallWind(x, y, z)
  if (ww !== 0) {
    wz += ww
    if (Math.abs(ww) > 4) out.zone = '强风墙'
  }
  out.x = wx
  out.z = wz
  out.speed = Math.hypot(wx, wz)
  return out
}

/** 强风墙风速（沿 Z，正 = 吹向北）。只取决于位置与高度 */
export function wallWind(x: number, y: number, z: number) {
  if (z < WALL.z0 - 120 || z > WALL.z1 + 120 || Math.abs(x) > WALL.x + 300) return 0
  const mid = (WALL.z0 + WALL.z1) / 2, half = (WALL.z1 - WALL.z0) / 2
  const d = Math.abs(z - mid) / (half + 120)
  const prof = 1 - smooth(0.55, 1, d)
  const alt = 1 - smooth(WALL.alt - 40, WALL.alt, y)
  const edge = 1 - smooth(WALL.x, WALL.x + 300, Math.abs(x))
  return (z < mid ? -1 : 1) * 24 * prof * alt * edge
}
