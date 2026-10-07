import * as THREE from 'three'

/**
 * 昼夜循环与雾。
 * 游戏内一天 = 18 分钟现实时间；只在航行时推进（港口面板 / 暂停时停止）。
 * 本模块只含纯数据与计算；渲染端（Environment.tsx）每帧读取 env。
 */
export const DAY_SECONDS = 18 * 60
export const HOURS_PER_SEC = 24 / DAY_SECONDS
export const START_TOD = 16.6

/** 运行时环境状态（每帧更新） */
export const env = {
  /** 当前时刻（0..24 小时） */
  tod: START_TOD,
  /** 夜晚程度 0（白天）..1（深夜） */
  night: 0,
  /** 飞艇所在处的雾浓度 0..1 */
  fog: 0,
  /** 镜头所在处的雷暴浓度 0..1 */
  storm: 0,
  /** 闪电闪光 0..1（雷暴模块写入） */
  flash: 0,
  /** 太阳方向（单位向量，夜间在地平线下） */
  sun: new THREE.Vector3(),
  /** 探照灯开关 */
  searchlight: false,
  /** v1.3 镜头处的霜原程度 0..1（冷色调、降雪、极光） */
  frost: 0,
}

// 日出方向（与原夕阳方向相反），日落方向即原 M0 的夕阳方向
const SET = new THREE.Vector3(-0.72, 0, 0.68).normalize()
const RISE = SET.clone().negate()
const SIDE = new THREE.Vector3(0.68, 0, 0.72).normalize()

/** 太阳方向：6 点日出、18 点日落 */
export function sunDir(tod: number, out: THREE.Vector3) {
  const th = ((tod - 6) / 12) * Math.PI
  out.copy(RISE).multiplyScalar(Math.cos(th)).addScaledVector(SIDE, Math.sin(th) * 0.45)
  out.y = Math.sin(th) * 0.8
  return out.normalize()
}

type Key = {
  t: number
  horizon: string; low: string; mid: string; zenith: string
  sun: string; sunI: number
  hemiSky: string; hemiGround: string; hemiI: number
  amb: number
  fog: string
  cloud: string; cloudE: number
  night: number
}
const K: Key[] = [
  { t: 0, horizon: '#1d2440', low: '#172038', mid: '#10182e', zenith: '#070b1a', sun: '#8aa0d8', sunI: 0.35, hemiSky: '#5a6aa0', hemiGround: '#1c1a2a', hemiI: 0.5, amb: 0.16, fog: '#1a2036', cloud: '#26304a', cloudE: 0.12, night: 1 },
  { t: 4.6, horizon: '#1d2440', low: '#172038', mid: '#10182e', zenith: '#070b1a', sun: '#8aa0d8', sunI: 0.35, hemiSky: '#5a6aa0', hemiGround: '#1c1a2a', hemiI: 0.5, amb: 0.16, fog: '#1a2036', cloud: '#26304a', cloudE: 0.12, night: 1 },
  { t: 5.8, horizon: '#e89a8a', low: '#a0789a', mid: '#4a4a7a', zenith: '#1e2650', sun: '#ff9a6a', sunI: 1.1, hemiSky: '#c09ab0', hemiGround: '#4a3a50', hemiI: 0.8, amb: 0.2, fog: '#b8a0b0', cloud: '#c8a8b8', cloudE: 0.3, night: 0.45 },
  { t: 7.2, horizon: '#ffe0c0', low: '#f8c8b0', mid: '#a8b8d8', zenith: '#5a80c0', sun: '#ffd2a0', sunI: 2.2, hemiSky: '#ffe8d0', hemiGround: '#8a7a8a', hemiI: 1.1, amb: 0.25, fog: '#f0d8c8', cloud: '#fff4ec', cloudE: 0.4, night: 0 },
  { t: 12, horizon: '#e8f0f8', low: '#c8dcf0', mid: '#90b8e8', zenith: '#4a7ac8', sun: '#fff4e0', sunI: 2.8, hemiSky: '#f0f4ff', hemiGround: '#8a8a90', hemiI: 1.2, amb: 0.28, fog: '#d8e4f0', cloud: '#ffffff', cloudE: 0.35, night: 0 },
  { t: 15.5, horizon: '#fff0d8', low: '#f0d8c0', mid: '#a8b8d8', zenith: '#5078b8', sun: '#ffe0b0', sunI: 2.6, hemiSky: '#ffe8d0', hemiGround: '#8a7a80', hemiI: 1.15, amb: 0.26, fog: '#f0dcc8', cloud: '#fff4ec', cloudE: 0.4, night: 0 },
  // 17 点左右：M0 的夕阳配色
  { t: 17.2, horizon: '#ffc28c', low: '#fa9473', mid: '#b37394', zenith: '#384785', sun: '#ffb27a', sunI: 2.6, hemiSky: '#ffd9bd', hemiGround: '#7a6386', hemiI: 1.15, amb: 0.25, fog: '#eeb38e', cloud: '#fbe9ee', cloudE: 0.45, night: 0 },
  { t: 18.4, horizon: '#c86a6a', low: '#7a4a6a', mid: '#3a3260', zenith: '#161a3a', sun: '#ff7a50', sunI: 0.9, hemiSky: '#9a7aa0', hemiGround: '#3a2a40', hemiI: 0.75, amb: 0.2, fog: '#6a5070', cloud: '#7a6080', cloudE: 0.25, night: 0.55 },
  { t: 19.6, horizon: '#1d2440', low: '#172038', mid: '#10182e', zenith: '#070b1a', sun: '#8aa0d8', sunI: 0.35, hemiSky: '#5a6aa0', hemiGround: '#1c1a2a', hemiI: 0.5, amb: 0.16, fog: '#1a2036', cloud: '#26304a', cloudE: 0.12, night: 1 },
  { t: 24, horizon: '#1d2440', low: '#172038', mid: '#10182e', zenith: '#070b1a', sun: '#8aa0d8', sunI: 0.35, hemiSky: '#5a6aa0', hemiGround: '#1c1a2a', hemiI: 0.5, amb: 0.16, fog: '#1a2036', cloud: '#26304a', cloudE: 0.12, night: 1 },
]
const ca = new THREE.Color(), cb = new THREE.Color()
export type Palette = {
  horizon: THREE.Color; low: THREE.Color; mid: THREE.Color; zenith: THREE.Color
  sun: THREE.Color; sunI: number; hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number; amb: number
  fog: THREE.Color; cloud: THREE.Color; cloudE: number; night: number
}
export const newPalette = (): Palette => ({ horizon: new THREE.Color(), low: new THREE.Color(), mid: new THREE.Color(), zenith: new THREE.Color(), sun: new THREE.Color(), sunI: 0, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 0, amb: 0, fog: new THREE.Color(), cloud: new THREE.Color(), cloudE: 0, night: 0 })
const COLS = ['horizon', 'low', 'mid', 'zenith', 'sun', 'hemiSky', 'hemiGround', 'fog', 'cloud'] as const
const NUMS = ['sunI', 'hemiI', 'amb', 'cloudE', 'night'] as const
/** 按时刻插值调色板 */
export function palette(tod: number, out: Palette) {
  const t = ((tod % 24) + 24) % 24
  let i = 0
  while (i < K.length - 2 && K[i + 1].t <= t) i++
  const a = K[i], b = K[i + 1]
  const f = THREE.MathUtils.smoothstep(t, a.t, b.t)
  for (const c of COLS) out[c].copy(ca.set(a[c])).lerp(cb.set(b[c]), f)
  for (const n of NUMS) out[n] = a[n] + (b[n] - a[n]) * f
  return out
}

const hsl = { h: 0, s: 0, l: 0 }
/** v1.3 霜原：把调色板推向冷色（色相移向冰蓝、降低饱和度、雾更白） */
export function frostify(out: Palette, k: number) {
  if (k <= 0.001) return out
  for (const c of COLS) {
    out[c].getHSL(hsl)
    let dh = 0.58 - hsl.h
    if (dh > 0.5) dh -= 1
    if (dh < -0.5) dh += 1
    const w = c === 'sun' ? 0.35 : 0.6
    out[c].setHSL((hsl.h + dh * k * w + 1) % 1, hsl.s * (1 - 0.4 * k), Math.min(1, hsl.l * (1 + 0.08 * k * (1 - out.night))))
  }
  out.sunI *= 1 - 0.15 * k
  return out
}

/** 时段名称 */
export function periodName(tod: number) {
  const t = ((tod % 24) + 24) % 24
  if (t < 4.6) return '深夜'
  if (t < 6.5) return '黎明'
  if (t < 10) return '上午'
  if (t < 14) return '正午'
  if (t < 16.5) return '下午'
  if (t < 18.4) return '黄昏'
  if (t < 20) return '入夜'
  return '夜晚'
}
export const fmtTod = (tod: number) => {
  const t = ((tod % 24) + 24) % 24
  const h = Math.floor(t), m = Math.floor((t - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------- 雾 ----------------
/** 固定雾区（中心、半径），会缓慢呼吸 */
export const FOG_BANKS = [
  { id: 'reed', name: '芦苇礁雾海', x: 1650, z: 500, r: 520 },
  { id: 'pine', name: '松风雾林', x: -800, z: 1450, r: 480 },
  { id: 'beacon', name: '西陲迷雾', x: -1500, z: -600, r: 560 },
]
/** 黎明时全域起薄雾（6:30 左右最浓） */
export const dawnFog = (tod: number) => {
  const t = ((tod % 24) + 24) % 24
  return Math.max(0, 1 - Math.abs(t - 6.4) / 1.6) * 0.75
}
/** 雾区自身浓度（随时间起伏：夜里与清晨更浓） */
export function bankStrength(tod: number, i: number) {
  const t = ((tod % 24) + 24) % 24
  const base = 0.75 + 0.25 * Math.sin(t * 0.7 + i * 2.1)
  const morning = t < 10 || t > 20 ? 1 : 0.8
  return Math.min(1, base * morning)
}
/** 任意位置的雾浓度 0..1 */
export function fogAt(x: number, y: number, z: number, tod: number) {
  let f = dawnFog(tod) * (1 - THREE.MathUtils.smoothstep(y, 220, 360))
  FOG_BANKS.forEach((b, i) => {
    const d = Math.hypot(x - b.x, z - b.z)
    const k = (1 - THREE.MathUtils.smoothstep(d, b.r * 0.55, b.r)) * bankStrength(tod, i) * (1 - THREE.MathUtils.smoothstep(y, 260, 380))
    f = Math.max(f, k)
  })
  return f
}
