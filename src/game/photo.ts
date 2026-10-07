import { create } from 'zustand'
import * as THREE from 'three'
import { env } from './env'
import { useGame } from './store'
import { useEco } from './economy'

/**
 * 照相模式：冻结模拟、隐藏 HUD、自由镜头，滤镜 / 暗角 / 曝光 / 视野 / 时刻，可保存 PNG。
 */
export type Filter = 'none' | 'warm' | 'retro' | 'bw'
export const FILTERS: Record<Filter, string> = { none: '原色', warm: '暖阳', retro: '复古', bw: '黑白' }
const FILTER_CSS: Record<Filter, string> = {
  none: '',
  warm: 'sepia(0.22) saturate(1.35) hue-rotate(-10deg)',
  retro: 'sepia(0.62) contrast(1.12) saturate(0.85)',
  bw: 'grayscale(1) contrast(1.18)',
}
type PhotoUi = { filter: Filter; vignette: number; exposure: number; fov: number; tod: number; hidePanel: boolean }
export const usePhoto = create<PhotoUi>(() => ({ filter: 'none', vignette: 0.35, exposure: 1, fov: 58, tod: 12, hidePanel: false }))

/** 组合后的 CSS / Canvas2D filter 字符串 */
export function photoFilter(p: Pick<PhotoUi, 'filter' | 'exposure'>) {
  const parts = [FILTER_CSS[p.filter]]
  if (Math.abs(p.exposure - 1) > 0.01) parts.push(`brightness(${p.exposure.toFixed(2)})`)
  return parts.filter(Boolean).join(' ') || 'none'
}

/** 运行时：自由镜头状态 + 截图函数（由 World 注册） */
export const photo = {
  active: false,
  enter: false,
  pos: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  savedTod: 12,
  capture: null as null | (() => string | null),
}

export function enterPhoto() {
  const g = useGame.getState()
  if (g.screen !== 'play' || g.sheet) return
  photo.active = true
  photo.enter = true
  photo.savedTod = env.tod
  usePhoto.setState({ tod: env.tod, hidePanel: false })
  useGame.setState({ screen: 'photo' })
}
export function exitPhoto() {
  if (useGame.getState().screen !== 'photo') return
  photo.active = false
  env.tod = photo.savedTod
  useGame.setState({ screen: 'play' })
}
export const togglePhoto = () => (useGame.getState().screen === 'photo' ? exitPhoto() : enterPhoto())

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 保存截图（浏览器下载；exe 版自动存到「图片/云港航运」） */
export function savePhoto() {
  const url = photo.capture?.()
  if (!url) { useEco.getState().note('截图失败', true); return }
  const d = new Date()
  const name = `云港航运-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.png`
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  useEco.getState().note(`📷 已保存截图：${name}`)
}
