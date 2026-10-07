import { create } from 'zustand'
import { inputHooks, padAxes, trigger } from './input'
import { useGame } from './store'
import { useStory } from './story'
import { useEco } from './economy'
import { photo, savePhoto } from './photo'
import { arms } from './combat'

/**
 * 手柄（标准 Gamepad API 映射，Xbox 布局）：
 * 左摇杆 X 方向舵 · 左摇杆 Y / 十字键上下 换档 · 右摇杆 环视 · RT / LT 锅炉加压 / 减压
 * A 靠泊（E）· B 抛货（J）/ 返回 · X 探照灯 · Y 视角 · Start 暂停 · Back 地图 · 左摇杆按下 压力归中
 * v1.2：RB 按住开火 · LB 鱼叉 · 十字键← 照明弹 · 十字键→ / 右摇杆按下 照相模式
 */
export type InputMode = 'kb' | 'pad'
export const useInput = create<{ mode: InputMode; pad: string | null }>(() => ({ mode: 'kb', pad: null }))
inputHooks.onKeyboard = () => { if (useInput.getState().mode !== 'kb') useInput.setState({ mode: 'kb' }) }

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 }
/** 右摇杆环视、照相模式自由镜头读取 */
export const pad = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, up: false, down: false }
const prev: boolean[] = []
const DZ = 0.18
const dz = (v: number) => (Math.abs(v) < DZ ? 0 : Math.sign(v) * (Math.abs(v) - DZ) / (1 - DZ))
let gearRepeatAt = 0
let gearDir = 0

if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', (e) => {
    const name = (e as GamepadEvent).gamepad.id.replace(/\s*\(.*\)\s*/g, ' ').trim() || '手柄'
    useInput.setState({ pad: name })
    useEco.getState().note(`🎮 已连接手柄：${name}`)
  })
  window.addEventListener('gamepaddisconnected', () => {
    useInput.setState({ pad: null, mode: 'kb' })
    padAxes.lift = padAxes.rudder = 0
    pad.connected = false
    useEco.getState().note('🎮 手柄已断开', true)
  })
}

function press(b: number) {
  const g = useGame.getState()
  const cards = useStory.getState().cards.length
  const eco = useEco.getState()
  switch (b) {
    case BTN.A:
      if (cards) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }))
      else if (g.screen === 'photo') savePhoto()
      else if (eco.settlement) eco.closeSettlement()
      else trigger('KeyE')
      break
    case BTN.B:
      if (cards) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }))
      else if (eco.settlement) eco.closeSettlement()
      else if (g.sheet) g.openSheet(null)
      else if (g.screen === 'photo') trigger('KeyP')
      else if (g.screen === 'port') g.closePort()
      else if (g.screen === 'paused') g.resume()
      else trigger('KeyJ')
      break
    case BTN.X: trigger('KeyL'); break
    case BTN.Y: trigger('KeyV'); break
    case BTN.START: trigger('Escape'); break
    case BTN.BACK: trigger('KeyM'); break
    case BTN.LB: trigger('KeyG'); break
    case BTN.LEFT: trigger('KeyZ'); break
    case BTN.RIGHT: case BTN.RS: trigger('KeyP'); break
    case BTN.LS: trigger('KeyX'); break
  }
}

/** 每帧调用 */
export function pollPad(now: number) {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  let gp: Gamepad | null = null
  for (const g of list) if (g && g.connected) { gp = g; break }
  if (!gp) { if (pad.connected) { pad.connected = false; padAxes.lift = padAxes.rudder = 0; arms.pad = false } return }
  pad.connected = true
  const ax = gp.axes, bt = gp.buttons
  pad.lx = dz(ax[0] ?? 0); pad.ly = dz(ax[1] ?? 0); pad.rx = dz(ax[2] ?? 0); pad.ry = dz(ax[3] ?? 0)
  pad.lt = bt[BTN.LT]?.value ?? 0; pad.rt = bt[BTN.RT]?.value ?? 0
  pad.up = !!bt[BTN.UP]?.pressed; pad.down = !!bt[BTN.DOWN]?.pressed
  let active = Math.abs(pad.lx) + Math.abs(pad.ly) + Math.abs(pad.rx) + Math.abs(pad.ry) + pad.lt + pad.rt > 0.15
  for (let i = 0; i < bt.length; i++) {
    const p = !!bt[i]?.pressed
    if (p) active = true
    if (p && !prev[i]) press(i)
    prev[i] = p
  }
  if (active && useInput.getState().mode !== 'pad') useInput.setState({ mode: 'pad', pad: useInput.getState().pad ?? gp.id })

  const photoMode = useGame.getState().screen === 'photo' || photo.active
  arms.pad = !photoMode && useGame.getState().screen === 'play' && !!bt[BTN.RB]?.pressed
  if (photoMode) { padAxes.lift = padAxes.rudder = 0; return }
  // 模拟量：方向舵（+1 = 左舵）与锅炉加 / 减压
  padAxes.rudder = -pad.lx
  padAxes.lift = Math.max(-1, Math.min(1, (pad.rt > 0.08 ? pad.rt : 0) - (pad.lt > 0.08 ? pad.lt : 0)))
  // 换档：左摇杆 Y 或十字键上下，按住时每 0.35 秒重复
  const dir = pad.up || pad.ly < -0.65 ? 1 : pad.down || pad.ly > 0.65 ? -1 : 0
  if (dir !== gearDir) { gearDir = dir; gearRepeatAt = now + 0.45; if (dir) trigger(dir > 0 ? 'KeyW' : 'KeyS') }
  else if (dir && now > gearRepeatAt) { gearRepeatAt = now + 0.35; trigger(dir > 0 ? 'KeyW' : 'KeyS') }
}
