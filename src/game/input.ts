/** 键盘输入：按住类按键用集合查询，单次触发类按键用回调。 */
const keys = new Set<string>()
const handlers = new Map<string, () => void>()
const PREVENT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

/**
 * 统一用物理键位 e.code（不受中文输入法 / 键盘布局影响）。
 * 极少数环境下 code 为空时，用 keyCode 推导（输入法组字中的 229 无法推导，忽略）。
 */
export function keyCodeOf(e: KeyboardEvent): string {
  if (e.code && e.code !== 'Unidentified') return e.code
  const kc = e.keyCode
  if (kc >= 65 && kc <= 90) return 'Key' + String.fromCharCode(kc)
  const map: Record<number, string> = { 32: 'Space', 13: 'Enter', 27: 'Escape', 16: 'ShiftLeft', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' }
  return map[kc] ?? ''
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const code = keyCodeOf(e)
    if (!code) return
    // 焦点在输入控件（设置里的滑块）时不劫持方向键
    const t = e.target as HTMLElement | null
    if (t && t.tagName === 'INPUT' && code.startsWith('Arrow')) return
    keys.add(code)
    inputHooks.onKeyboard?.()
    if (PREVENT.includes(code)) e.preventDefault()
    if (e.repeat) return
    handlers.get(code)?.()
  })
  window.addEventListener('keyup', (e) => { const c = keyCodeOf(e); if (c) keys.delete(c); })
  window.addEventListener('blur', () => keys.clear())
}

/** 键盘活动回调（用于切换 HUD 提示为键盘 / 手柄） */
export const inputHooks: { onKeyboard?: () => void } = {}
/** 某个键是否按住 */
export const isDown = (code: string) => keys.has(code)
/** 以代码方式触发某键的单次回调（手柄复用键盘逻辑） */
export function trigger(code: string) { handlers.get(code)?.() }

/** 注册单次按键回调（同一键码后注册覆盖前者） */
export function onKey(codes: string[], fn: () => void) {
  for (const c of codes) handlers.set(c, fn)
}

export type Controls = {
  /** +1 提高锅炉压力目标，-1 降低 */
  lift: number
  /** +1 左舵，-1 右舵 */
  rudder: number
}

/** 手柄模拟量（由 pad.ts 每帧写入） */
export const padAxes = { lift: 0, rudder: 0 }

export function readControls(): Controls {
  const k = (c: string) => (keys.has(c) ? 1 : 0)
  const kl = Math.sign(k('KeyR') + k('Space') - k('KeyF') - k('ShiftLeft') - k('ShiftRight'))
  const kr = Math.sign(k('KeyA') + k('ArrowLeft') - k('KeyD') - k('ArrowRight'))
  const lift = Math.max(-1, Math.min(1, kl + padAxes.lift))
  const rudder = Math.max(-1, Math.min(1, kr + padAxes.rudder))
  return { lift, rudder }
}
