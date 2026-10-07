import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { arms, combatReadout, npc, radiusOf, targets, type CombatReadout } from '../game/combat'
import { ship } from '../game/flight'
import { useGame } from '../game/store'
import { useInput } from '../game/pad'
import { WTABLE, WEAPONS } from '../game/weapons'
import { fmtDist } from './Port'
import { useEco } from '../game/economy'

const useGameState = () => useEco.getState()

/** v1.2 战斗 HUD：武器栏（过热 / 鱼叉 / 照明弹）、首领血条、战斗委托（护航商船耐久 / 悬赏 / 特别篇） */
export function CombatHud({ part }: { part: 'main' | 'mission' }) {
  const [r, setR] = useState<CombatReadout>(() => combatReadout())
  const mode = useInput((s) => s.mode)
  const inPort = useGame((s) => s.screen === 'port')
  useEffect(() => { const id = setInterval(() => setR(combatReadout()), 90); return () => clearInterval(id) }, [])
  if (part === 'mission') return <MissionBox r={r} />
  return (
    <>
      {r.boss && <BossBar b={r.boss} />}
      {r.armed && !inPort && <WeaponBar r={r} pad={mode === 'pad'} />}
    </>
  )
}

function WeaponBar({ r, pad }: { r: CombatReadout; pad: boolean }) {
  const k = (kb: string, gp: string) => <kbd>{pad ? gp : kb}</kbd>
  const fmax = r.w.flare ? WTABLE.flare.ammo[r.w.flare - 1] : 0
  const h = r.harpoon
  return (
    <div className="weapon-bar brass-frame">
      {r.w.gun > 0 && (
        <div className={`wslot gun ${r.over ? 'over' : ''} ${r.firing && !r.over ? 'fire' : ''}`}>
          <div className="wh"><i>{WEAPONS.gun.icon}</i><b>机炮</b>{k('C / 左键', 'RB')}</div>
          <div className="heat"><i style={{ width: `${r.heat * 100}%` }} /><small>{r.over ? '过热！冷却中' : `热量 ${Math.round(r.heat * 100)}%`}</small></div>
          <small className="lock">{r.lock ? <>锁定 <b>{r.lock.name}</b> · {Math.round(r.lock.dist)} 米</> : '无目标 · 朝镜头方向射击'}</small>
        </div>
      )}
      {r.w.harpoon > 0 && (
        <div className={`wslot harpoon ${h.state}`}>
          <div className="wh"><i>{WEAPONS.harpoon.icon}</i><b>鱼叉</b>{k('G', 'LB')}</div>
          <small className="st">{h.state === 'hook' ? `已钩住 · ${h.t.toFixed(0)} 秒 · 再按松开` : h.state === 'fly' ? '飞行中……' : h.state === 'cd' ? `装填 ${h.t.toFixed(1)} 秒` : `就绪 · 射程 ${WTABLE.harpoon.range[r.w.harpoon - 1]} 米`}</small>
        </div>
      )}
      {r.w.flare > 0 && (
        <div className={`wslot flare ${r.flares ? '' : 'empty'}`}>
          <div className="wh"><i>{WEAPONS.flare.icon}</i><b>照明弹</b>{k('Z', '✚←')}</div>
          <div className="ammo">{Array.from({ length: fmax }, (_, i) => <s key={i} className={i < r.flares ? 'on' : ''} />)}</div>
          <small className="st">{r.flares ? `${r.flares}/${fmax}` : '用完了 · 靠港补充'}</small>
        </div>
      )}
    </div>
  )
}

function BossBar({ b }: { b: NonNullable<CombatReadout['boss']> }) {
  const k = b.hp / b.maxHp
  const phase = ['', '第一阶段 · 侧舷齐射', '第二阶段 · 小艇出击', '第三阶段 · 风暴冲撞'][b.phase] ?? ''
  return (
    <div className={`boss-bar ${b.ram ? 'ram' : ''}`}>
      <div className="bb-title"><b>🏴 {b.name}</b><small>黑鸦的旗舰 · {phase}</small></div>
      <div className="bb-bar">
        <i style={{ width: `${k * 100}%` }} />
        <s style={{ left: '33%' }} /><s style={{ left: '66%' }} />
        <small>{Math.max(0, Math.round(b.hp))} / {b.maxHp}</small>
      </div>
      {b.ram && <div className="bb-warn">⚠ 冲撞！侧向闪避！</div>}
    </div>
  )
}

function MissionBox({ r }: { r: CombatReadout }) {
  const m = r.mission
  if (!m) return null
  const rel = m.brg - ((-ship.yaw * 180) / Math.PI)
  const e = r.escort
  return (
    <div className={`mission-box brass-frame m-${m.kind}`}>
      <div className="mb-head">
        <svg viewBox="-15 -15 30 30"><g transform={`rotate(${rel})`}><path d="M0,-12 L8,6 L0,2 L-8,6 Z" fill={m.kind === 'escort' ? '#7fd0ff' : '#ff6a4a'} stroke="#2a1408" strokeWidth={1.2} /></g></svg>
        <div><b>{m.title}</b><small>{m.sub} · {fmtDist(m.dist)}</small></div>
      </div>
      {e && (
        <div className={`npc-hp ${e.hit ? 'hit' : ''}`}>
          <span>商船</span>
          <div className="bar"><i style={{ width: `${e.hp}%` }} /></div>
          <span>{Math.round(e.hp)}%</span>
        </div>
      )}
      {e && <div className="npc-prog"><i style={{ width: `${e.prog * 100}%` }} /></div>}
    </div>
  )
}

/** 屏幕空间：敌船血条 / 名字、锁定框、护航商船标记、准星 */
const MAXM = 9
export function TargetMarks() {
  const root = useRef<HTMLDivElement>(null)
  const screen = useGame((s) => s.screen)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const marks = Array.from(el.querySelectorAll<HTMLDivElement>('.tmark'))
    const cross = el.querySelector<HTMLDivElement>('.xhair')!
    const npcEl = el.querySelector<HTMLDivElement>('.nmark')!
    const v = new THREE.Vector3()
    let raf = 0
    const proj = (p: THREE.Vector3, dy = 0) => {
      const cam = arms.cam
      if (!cam) return null
      v.copy(p); v.y += dy
      v.project(cam)
      if (v.z > 1 || v.z < -1) return null
      return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight] as const
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const list = targets()
      let n = 0
      for (const t of list) {
        if (n >= MAXM) break
        const d = t.pos.distanceTo(ship.pos)
        if (d > 900) continue
        const p = proj(t.pos, radiusOf(t) * 0.9 + 4)
        if (!p) continue
        const m = marks[n++]
        m.style.display = 'block'
        m.style.transform = `translate(${p[0]}px, ${p[1]}px)`
        m.className = `tmark ${arms.lock === t ? 'lock' : ''} ${t.kind === 'boss' ? 'boss' : ''} ${t.hooked ? 'hooked' : ''} ${t.blind > 0 ? 'blind' : ''}`
        ;(m.firstChild as HTMLElement).textContent = `${t.name} · ${Math.round(d)}米${t.blind > 0 ? ' · 致盲' : ''}${t.hooked ? ' · 钩住' : ''}`
        ;((m.children[1] as HTMLElement).firstChild as HTMLElement).style.width = `${Math.max(0, t.hp / t.maxHp) * 100}%`
      }
      for (let i = n; i < MAXM; i++) marks[i].style.display = 'none'
      // 护航商船
      const np = npc.active ? proj(npc.pos, 9) : null
      npcEl.style.display = np ? 'block' : 'none'
      if (np) {
        npcEl.style.transform = `translate(${np[0]}px, ${np[1]}px)`
        ;(npcEl.firstChild as HTMLElement).textContent = `商船「${npc.name}」 ${Math.round(npc.hp)}%`
        ;((npcEl.children[1] as HTMLElement).firstChild as HTMLElement).style.width = `${npc.hp}%`
      }
      // 准星：未锁定时子弹飞向的点
      const gun = (useGameState().weapons?.gun ?? 0) > 0
      if (gun && !arms.lock) {
        v.set(Math.sin(arms.aimYaw) * Math.cos(arms.aimPitch), Math.sin(arms.aimPitch), Math.cos(arms.aimYaw) * Math.cos(arms.aimPitch)).multiplyScalar(260).add(ship.pos)
        v.y -= 9.9
        const p = proj(v)
        cross.style.display = p ? 'block' : 'none'
        if (p) cross.style.transform = `translate(${p[0]}px, ${p[1]}px)`
      } else cross.style.display = 'none'
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [screen])
  return (
    <div className="tmarks" ref={root}>
      {Array.from({ length: MAXM }, (_, i) => <div key={i} className="tmark" style={{ display: 'none' }}><span /><div className="tbar"><i /></div><em className="bracket" /></div>)}
      <div className="nmark" style={{ display: 'none' }}><span /><div className="tbar"><i /></div></div>
      <div className="xhair" style={{ display: 'none' }}>+</div>
    </div>
  )
}
