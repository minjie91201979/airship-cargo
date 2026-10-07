import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 设置（单独持久化，键 airship-cargo.settings.v1） */
export type Quality = 'low' | 'medium' | 'high'
export const QUALITY_NAMES: Record<Quality, string> = { low: '流畅', medium: '均衡', high: '高清' }
export const QUALITY_DESC: Record<Quality, string> = {
  low: '低分辨率、无阴影、云团与粒子减半、关闭岛上点光源',
  medium: '标准分辨率、1024 阴影、适中云团与粒子',
  high: '高分辨率、2048 阴影、完整云团与粒子',
}
export const QUALITY_CFG: Record<Quality, { dpr: [number, number]; shadow: number; clouds: number; particles: number; lights: boolean }> = {
  low: { dpr: [0.6, 0.85], shadow: 0, clouds: 0.4, particles: 0.4, lights: false },
  medium: { dpr: [1, 1.25], shadow: 1024, clouds: 0.7, particles: 0.7, lights: true },
  high: { dpr: [1, 1.75], shadow: 2048, clouds: 1, particles: 1, lights: true },
}

export type Settings = {
  master: number
  sfx: number
  ambient: number
  quality: Quality
  turnSens: number
  lookSens: number
  invertLook: boolean
  shake: boolean
  showHint: boolean
  showFps: boolean
  /** 航线辅助：建议巡航高度 + 小地图航线 */
  routeAssist: boolean
  /** v1.2 鼠标左键开火 */
  mouseFire: boolean
}
export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.8, ambient: 0.6, quality: 'high', turnSens: 1, lookSens: 1, invertLook: false, shake: true, showHint: true, showFps: false, routeAssist: true, mouseFire: true,
}

export const useSettings = create<Settings & { set: (p: Partial<Settings>) => void; reset: () => void }>()(
  persist(
    (set) => ({ ...DEFAULT_SETTINGS, set: (p) => set(p), reset: () => set(DEFAULT_SETTINGS) }),
    { name: 'airship-cargo.settings.v1', version: 1, partialize: ({ set: _s, reset: _r, ...rest }) => { void _s; void _r; return rest } },
  ),
)
export const qcfg = () => QUALITY_CFG[useSettings.getState().quality]

/** 运行时：帧率（HUD 显示用） */
export const perf = { fps: 0 }
