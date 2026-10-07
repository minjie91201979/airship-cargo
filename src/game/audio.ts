/**
 * 程序生成音效（Web Audio，无音频文件）。
 * 持续声：蒸汽机「突突」声（随锅炉压力）、螺旋桨呼呼声（随桨速）、风声（随空速 / 高度）、
 *         雷暴雨声；一次性：雷声（与闪电同步）、港口钟声（靠近栈桥时，雾中也能听到）、
 *         空贼警报、装卸货、结算钱币、成就 / 章节钟声、按钮点击、煤水不足警示音、碰撞。
 */
import { ship } from './flight'
import { env } from './env'
import { pirate, stormAt } from './hazards'
import { DOCKS } from './world'
import { FUEL } from './fuel'
import { useEco } from './economy'
import { useFanfare } from './fanfare'
import { useSettings } from './settings'
import { combatHooks } from './combat'

let ctx: AudioContext | null = null
let master: GainNode, sfxBus: GainNode, ambBus: GainNode
let noiseBuf: AudioBuffer
type Loop = { g: GainNode; f: BiquadFilterNode }
let chug: { g: GainNode; f: BiquadFilterNode; lfo: OscillatorNode; depth: GainNode; osc: OscillatorNode } | null = null
let prop: { g: GainNode; osc: OscillatorNode; lfo: OscillatorNode; f: BiquadFilterNode } | null = null
let wind: Loop | null = null
let rain: Loop | null = null
let lastFlash = 0, lastBump = 0
let bellT = 0, alarmT = 0, warnT = 0

function makeNoise() {
  const c = ctx!
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const d = b.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    last = (last + 0.02 * w) / 1.02
    d[i] = last * 3.5 * 0.6 + w * 0.4
  }
  return b
}
function noiseSrc() {
  const s = ctx!.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  s.start(0, Math.random() * 1.5)
  return s
}
function loop(type: BiquadFilterType, freq: number, bus: GainNode, q = 0.7): Loop {
  const n = noiseSrc(), f = ctx!.createBiquadFilter(), g = ctx!.createGain()
  f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0
  n.connect(f).connect(g).connect(bus)
  return { g, f }
}

export const audioCtx = () => ctx

/** 第一次用户点击 / 按键后创建（浏览器要求） */
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  noiseBuf = makeNoise()
  master = ctx.createGain(); master.connect(ctx.destination)
  const comp = ctx.createDynamicsCompressor(); comp.connect(master)
  sfxBus = ctx.createGain(); sfxBus.connect(comp)
  ambBus = ctx.createGain(); ambBus.connect(comp)
  // 蒸汽机：低频噪声 + 低音，被 LFO 调制成「突、突、突」
  {
    const c = ctx
    const out = c.createGain(); out.gain.value = 0; out.connect(sfxBus)
    const am = c.createGain(); am.gain.value = 0.5; am.connect(out)
    const n = noiseSrc(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 2
    n.connect(f).connect(am)
    const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 48
    const og = c.createGain(); og.gain.value = 0.35; osc.connect(og).connect(am)
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2
    const depth = c.createGain(); depth.gain.value = 0.48
    lfo.connect(depth).connect(am.gain)
    osc.start(); lfo.start()
    chug = { g: out, f, lfo, depth, osc }
  }
  // 螺旋桨：锯齿波经低通 + 桨叶拍频
  {
    const c = ctx
    const out = c.createGain(); out.gain.value = 0; out.connect(sfxBus)
    const am = c.createGain(); am.gain.value = 0.7; am.connect(out)
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400
    osc.connect(f).connect(am)
    const n = noiseSrc(), nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.8
    const ng = c.createGain(); ng.gain.value = 0.5; n.connect(nf).connect(ng).connect(am)
    const lfo = c.createOscillator(); lfo.frequency.value = 8
    const lg = c.createGain(); lg.gain.value = 0.3; lfo.connect(lg).connect(am.gain)
    osc.start(); lfo.start()
    prop = { g: out, osc, lfo, f }
  }
  wind = loop('bandpass', 400, ambBus)
  rain = loop('highpass', 1800, ambBus)
  applyVolumes()
  useSettings.subscribe(applyVolumes)
}

function applyVolumes() {
  if (!ctx) return
  const s = useSettings.getState()
  const t = ctx.currentTime
  master.gain.setTargetAtTime(s.master, t, 0.05)
  sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05)
  ambBus.gain.setTargetAtTime(s.ambient, t, 0.05)
}

/** 每帧调用：play 全音量；duck（暂停 / 港口面板）压低；off（主菜单）只留环境声 */
export function updateAudio(mode: 'play' | 'duck' | 'off', dt: number) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const on = mode === 'play' ? 1 : mode === 'duck' ? 0.3 : 0
  const s = ship
  const burning = s.coal > 0 && !s.docked
  // 蒸汽机
  const p = s.pressure
  chug!.lfo.frequency.setTargetAtTime(burning ? 1.6 + p * 4.5 + Math.abs(s.prop) * 1.5 : 0.8, t, 0.3)
  chug!.osc.frequency.setTargetAtTime(42 + p * 26, t, 0.3)
  chug!.f.frequency.setTargetAtTime(180 + p * 380, t, 0.3)
  chug!.g.gain.setTargetAtTime(on * (burning ? 0.18 + p * 0.4 : s.docked ? 0.05 : 0), t, 0.25)
  // 螺旋桨
  const pr = Math.abs(s.prop)
  prop!.osc.frequency.setTargetAtTime(38 + pr * 110, t, 0.2)
  prop!.lfo.frequency.setTargetAtTime(3 + pr * 16, t, 0.2)
  prop!.f.frequency.setTargetAtTime(250 + pr * 900, t, 0.2)
  prop!.g.gain.setTargetAtTime(on * pr * 0.32, t, 0.2)
  // 风声：空速 + 高度
  const spd = s.docked ? 0 : Math.hypot(s.vel.x - s.wind.x, s.vel.z - s.wind.z)
  const altK = Math.min(1, Math.max(0, (s.pos.y - 100) / 400))
  const amb = mode === 'off' ? 0.5 : mode === 'duck' ? 0.45 : 1
  const sk = stormAt(s.pos.x, s.pos.y, s.pos.z).k
  wind!.g.gain.setTargetAtTime(amb * (0.04 + Math.min(1, spd / 18) * 0.28 + altK * 0.12 + sk * 0.25 + s.wind.speed * 0.01), t, 0.4)
  wind!.f.frequency.setTargetAtTime(280 + Math.min(1, spd / 18) * 700 + altK * 200, t, 0.4)
  // 雨声：雷暴
  rain!.g.gain.setTargetAtTime(Math.max(sk, env.storm) * 0.4 * amb, t, 0.5)
  // 雷声：闪电后延迟 0.3–1.2 秒（越近越快越响）
  if (env.flash > 0.8 && lastFlash <= 0.8) { const k = Math.max(0.35, sk); setTimeout(() => thunder(k), 300 + (1 - k) * 900) }
  lastFlash = env.flash
  if (mode !== 'play') return
  // 碰撞
  if (s.bump > lastBump + 0.2) sfx('bump')
  lastBump = s.bump
  // 港口钟声：栈桥附近每 5 秒一响，雾中可在更远处听到
  bellT -= dt
  if (bellT <= 0) {
    let best = Infinity
    for (const d of DOCKS) best = Math.min(best, Math.hypot(d.x - s.pos.x, d.z - s.pos.z))
    const range = 260 + env.fog * 500
    if (best < range && !s.docked) { bell(Math.max(0.1, 1 - best / range) * (0.6 + env.fog * 0.4)); bellT = 5 } else bellT = 1
  }
  // 空贼警报
  alarmT -= dt
  if (pirate.active && pirate.state === 'chase' && alarmT <= 0) {
    const d = Math.hypot(pirate.pos.x - s.pos.x, pirate.pos.z - s.pos.z)
    if (d < 700) { sfx('alarm', 1 - d / 700); alarmT = pirate.grapple > 0.05 ? 0.9 : 2.2 }
  }
  // 煤水不足
  warnT -= dt
  if (warnT <= 0 && !s.docked && (s.coal < FUEL.low || s.water < FUEL.low)) { sfx('warn'); warnT = s.coal <= 0 ? 1.5 : 3.5 }
}

function env1(g: GainNode, t: number, a: number, peak: number, dec: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec)
}
function tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, peak: number, bus = sfxBus) {
  const c = ctx!
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, at)
  o.frequency.exponentialRampToValueAtTime(f1, at + dur)
  env1(g, at, 0.008, peak, dur)
  o.connect(g).connect(bus)
  o.start(at); o.stop(at + dur + 0.05)
}
function burst(at: number, dur: number, peak: number, freq: number, type: BiquadFilterType = 'lowpass', bus = sfxBus) {
  const c = ctx!
  const n = noiseSrc(), f = c.createBiquadFilter(), g = c.createGain()
  f.type = type; f.frequency.value = freq
  env1(g, at, 0.01, peak, dur)
  n.connect(f).connect(g).connect(bus)
  n.stop(at + dur + 0.1)
}
function thunder(k: number) {
  if (!ctx) return
  const t = ctx.currentTime
  burst(t, 2.8, 0.9 * k, 160, 'lowpass', ambBus)
  burst(t + 0.04, 0.6, 0.55 * k, 800, 'lowpass', ambBus)
  burst(t + 0.5, 1.8, 0.4 * k, 110, 'lowpass', ambBus)
}
/** 铜钟：非谐和泛音 */
function bell(v: number) {
  if (!ctx) return
  const t = ctx.currentTime + 0.01
  const f = 392
  ;[[1, 0.35, 3.2], [2.76, 0.16, 2.2], [5.4, 0.08, 1.4], [0.5, 0.12, 3.6]].forEach(([m, a, d]) => tone('sine', f * m, f * m * 0.998, t, d, a * v, ambBus))
}

export type Sfx = 'bump' | 'click' | 'load' | 'unload' | 'coin' | 'achv' | 'chapter' | 'obj' | 'alarm' | 'warn' | 'gun' | 'cannon' | 'hit' | 'harpoon' | 'clank' | 'flare' | 'boom' | 'overheat'
export function sfx(kind: Sfx, level = 1) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.01
  switch (kind) {
    case 'bump':
      tone('sine', 130, 40, t, 0.35, 0.7)
      burst(t, 0.25, 0.5, 600)
      break
    case 'click':
      tone('sine', 1300, 950, t, 0.05, 0.1)
      break
    case 'load': // 木箱落舱：低沉「咚」
      tone('sine', 110, 55, t, 0.22, 0.6)
      burst(t, 0.12, 0.45, 900)
      break
    case 'unload':
      tone('sine', 90, 60, t, 0.2, 0.45)
      burst(t, 0.1, 0.35, 1200)
      tone('sine', 120, 70, t + 0.12, 0.18, 0.35)
      break
    case 'coin': // 一串钱币叮当
      for (let i = 0; i < 7; i++) { const f = 1800 + Math.random() * 900; tone('triangle', f, f * 0.98, t + i * 0.06 + Math.random() * 0.02, 0.25, 0.12) }
      tone('sine', 2637, 2637, t + 0.45, 0.6, 0.1)
      break
    case 'obj':
      tone('triangle', 880, 880, t, 0.25, 0.14); tone('triangle', 1175, 1175, t + 0.08, 0.35, 0.12)
      break
    case 'achv':
      ;[784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.35, 0.07))
      tone('sine', 1568, 1568, t + 0.3, 0.9, 0.2)
      break
    case 'chapter':
      ;[392, 523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.1, 0.9, 0.2))
      tone('sine', 1047, 1047, t + 0.5, 1.6, 0.18)
      bell(0.8)
      break
    case 'alarm': // 空贼：双音警报
      tone('square', 740, 740, t, 0.16, 0.06 + level * 0.08); tone('square', 554, 554, t + 0.18, 0.16, 0.06 + level * 0.08)
      break
    case 'warn':
      tone('sine', 1000, 1000, t, 0.09, 0.12); tone('sine', 1000, 1000, t + 0.16, 0.09, 0.12)
      break
    // ---- v1.2 战斗音效 ----
    case 'gun': // 蒸汽机炮：短促的「嗒」+ 气门嘶声
      burst(t, 0.06, 0.32 * level, 2600, 'bandpass')
      tone('square', 180, 70, t, 0.06, 0.12 * level)
      break
    case 'cannon': // 远处的炮声：低沉轰鸣
      tone('sine', 90, 32, t, 0.6, 0.55 * level)
      burst(t, 0.5, 0.5 * level, 380)
      burst(t + 0.02, 0.15, 0.3 * level, 1500)
      break
    case 'hit': // 炮弹打在船体上：金属撞击
      tone('triangle', 420, 160, t, 0.18, 0.4 * level)
      tone('square', 1250, 900, t, 0.08, 0.1 * level)
      burst(t, 0.22, 0.55 * level, 900)
      break
    case 'harpoon': // 鱼叉射出：嗖
      burst(t, 0.35, 0.45, 1400, 'highpass')
      tone('sawtooth', 300, 900, t, 0.25, 0.08)
      break
    case 'clank': // 鱼叉钩住：铁链哗啦
      for (let i = 0; i < 4; i++) tone('triangle', 900 + Math.random() * 500, 600, t + i * 0.05, 0.1, 0.15)
      tone('sine', 160, 90, t, 0.3, 0.35)
      break
    case 'flare': // 照明弹：噗——嘶
      tone('sine', 220, 60, t, 0.18, 0.4)
      burst(t + 0.05, 1.4, 0.35, 3500, 'highpass')
      break
    case 'boom': // 爆炸
      tone('sine', 70, 25, t, 1.2, 0.8 * Math.min(1, level))
      burst(t, 1.6, 0.9 * Math.min(1.2, level), 260)
      burst(t + 0.03, 0.4, 0.6 * Math.min(1, level), 1200)
      break
    case 'overheat': // 过热：泄压嘶声
      burst(t, 1.1, 0.4, 4200, 'highpass')
      tone('sine', 1500, 700, t, 0.5, 0.06)
      break
  }
}

combatHooks.sfx = (k, level) => sfx(k as Sfx, level)

if (typeof window !== 'undefined') {
  const kick = () => initAudio()
  window.addEventListener('pointerdown', kick)
  window.addEventListener('keydown', kick)
  window.addEventListener('click', (e) => { if ((e.target as HTMLElement)?.closest?.('button')) sfx('click') })
  // 装卸货 / 结算
  let lastN = useEco.getState().cargo.length
  let lastSettle = useEco.getState().settlement
  useEco.subscribe((s) => {
    if (s.cargo.length > lastN) sfx('load')
    else if (s.cargo.length < lastN && !s.settlement) sfx('unload')
    lastN = s.cargo.length
    if (s.settlement && s.settlement !== lastSettle) { sfx('unload'); setTimeout(() => sfx('coin'), 250) }
    lastSettle = s.settlement
  })
  // 提示条 → 钟声
  let lastFan = 0
  useFanfare.subscribe((s) => {
    for (const f of s.list) if (f.id > lastFan) { lastFan = f.id; sfx(f.kind === 'achv' ? 'achv' : f.kind === 'chapter' ? 'chapter' : 'obj') }
  })
}
