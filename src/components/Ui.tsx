import { useEffect, useRef, useState } from 'react'
import { GEAR_MAX, GEAR_MIN, GEAR_NAMES, ship, shipReadout, type Readout } from '../game/flight'
import { MAP_NAMES, VIEW_NAMES, useGame } from '../game/store'
import { CEILING, PORT, SINK_Y } from '../game/world'
import { FUEL } from '../game/fuel'
import { cargoWeight, dockOf, islandName, useEco } from '../game/economy'
import { startSession } from '../game/session'
import { HULLS, hullHpMax } from '../game/hulls'
import { env, fmtTod, periodName } from '../game/env'
import { GRAPPLE_R, PIRATE_CEIL, hazardReadout } from '../game/hazards'
import { Minimap } from './Minimap'
import { CargoRow, Coin, PortPanel, SettlementCard, fmtDist } from './Port'
import { AchvSheet, Fanfares, LogSheet, StoryCard, StoryTracker } from './Story'
import { useStory } from '../game/story'
import { SettingsSheet } from './Settings'
import { perf, useSettings } from '../game/settings'
import { useInput } from '../game/pad'
import { computeRoute, route, tailLabel, type RouteAdvice } from '../game/route'
import { PhotoPanel } from './Photo'
import { CombatHud, TargetMarks } from './CombatHud'

const CONTROLS: [string, string][] = [
  ['锅炉加压 / 减压（升 / 降）', 'R / F 或 空格 / Shift'],
  ['推进档位 加 / 减（-1 ~ 4）', 'W / S 或 ↑ / ↓'],
  ['方向舵 左 / 右', 'A / D 或 ← / →'],
  ['压力归中（随载重自动换算中性浮力）', 'X'],
  ['靠泊 / 打开港口面板（委托·货舱·补给）', 'E'],
  ['小地图 近景 / 全图 / 关闭', 'M'],
  ['切换视角', 'V'],
  ['环视', '按住鼠标左键拖拽'],
  ['紧急拖航到最近港口（连按两次，收费）', 'H H'],
  ['探照灯 开 / 关', 'L'],
  ['抛下价值最低的货物（引开空贼）', 'J'],
  ['蒸汽机炮 开火（按住，朝镜头方向，自动瞄准）', 'C / 鼠标左键'],
  ['鱼叉 发射 / 松开', 'G'],
  ['照明弹（诱饵，打断追击与钩索）', 'Z'],
  ['照相模式（冻结画面 · 自由镜头 · 滤镜 · 截图）', 'P'],
  ['暂停', 'Esc'],
]
const PAD_CONTROLS: [string, string][] = [
  ['锅炉加压 / 减压', 'RT / LT'],
  ['方向舵', '左摇杆 ←→'],
  ['推进档位 加 / 减', '左摇杆 ↑↓ 或 十字键 ↑↓'],
  ['环视', '右摇杆'],
  ['靠泊 / 港口面板 · 确认', 'Ⓐ'],
  ['抛货 · 返回 / 关闭面板', 'Ⓑ'],
  ['探照灯', 'Ⓧ'],
  ['切换视角', 'Ⓨ'],
  ['小地图', 'Back'],
  ['暂停', 'Start'],
  ['蒸汽机炮 开火（按住）', 'RB'],
  ['鱼叉 发射 / 松开', 'LB'],
  ['照明弹', '十字键 ←'],
  ['照相模式', '十字键 → / 右摇杆按下'],
  ['压力归中', '左摇杆按下'],
]
const HINT_KB = 'R/F 加减压 · W/S 档位 · A/D 转舵 · X 压力归中 · E 靠泊 / 港口 · M 地图 · V 视角 · 拖拽环视 · H×2 拖船 · L 探照灯 · J 抛货 · C/左键 开火 · G 鱼叉 · Z 照明弹 · P 照相 · Esc 暂停'
const HINT_PAD = 'RT/LT 加减压 · 左摇杆 转舵 / 换档 · 右摇杆 环视 · Ⓐ 靠泊 / 港口 · Ⓑ 抛货 · Ⓧ 探照灯 · Ⓨ 视角 · Back 地图 · RB 开火 · LB 鱼叉 · ✚← 照明弹 · ✚→ 照相 · Start 暂停'

function ControlsTable() {
  const mode = useInput((s) => s.mode)
  const padName = useInput((s) => s.pad)
  const [tab, setTab] = useState<'kb' | 'pad'>(mode)
  const rows = tab === 'pad' ? PAD_CONTROLS : CONTROLS
  return (
    <>
      <div className="ctl-tabs">
        <button className={tab === 'kb' ? 'small primary' : 'small'} onClick={() => setTab('kb')}>⌨ 键盘</button>
        <button className={tab === 'pad' ? 'small primary' : 'small'} onClick={() => setTab('pad')}>🎮 手柄{padName ? '（已连接）' : ''}</button>
      </div>
      <table className="controls">
        <tbody>{rows.map(([a, k]) => <tr key={a}><td>{a}</td><td><kbd>{k}</kbd></td></tr>)}</tbody>
      </table>
    </>
  )
}

function MainMenu() {
  const started = useEco((s) => s.started)
  const money = useEco((s) => s.money)
  const stats = useEco((s) => s.stats)
  const lastDock = useEco((s) => s.lastDock)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="overlay menu">
      <div className="brand">
        <div className="gear-deco">⚙</div>
        <h1>云港航运</h1>
        <p className="sub">驾驶蒸汽飞艇，穿梭浮空群岛，承接货运委托</p>
        <p className="en">AIRSHIP CARGO · STEAM SKY FREIGHT</p>
      </div>
      <div className="panel brass menu-panel">
        <div className="menu-btns">
          {started && <button className="primary" onClick={() => startSession(true)}>继续航行</button>}
          {started && <div className="save-info">存档：停靠{islandName(lastDock)} · 银币 {money} · 已交付 {stats.deliveries} 单</div>}
          {!confirm && <button className={started ? '' : 'primary'} onClick={() => (started ? setConfirm(true) : startSession(false))}>新的航程</button>}
          {confirm && (
            <div className="confirm">
              <span>开始新的航程将清空当前存档（银币、声望、货舱与统计），确定吗？</span>
              <div><button className="small primary" onClick={() => { setConfirm(false); startSession(false) }}>确定重新开始</button><button className="small" onClick={() => setConfirm(false)}>取消</button></div>
            </div>
          )}
          <div className="menu-row">
            <button onClick={() => useGame.getState().openSheet('log')}>📜 航运日志</button>
            <button onClick={() => useGame.getState().openSheet('achv')}>🏆 成就</button>
            <button onClick={() => useGame.getState().openSheet('settings')}>⚙ 设置</button>
          </div>
        </div>
        <h3>操作说明</h3>
        <ControlsTable />
        <p className="tip">提示：新的航程会从继承云港航运公司的序章开始，跟着左上方的主线目标一步步重建公司。空载时锅炉压力约 50% 为中性浮力，载货越重所需压力越高。靠泊后按 E 打开港口面板承接委托、购买煤水——煤矿岛煤便宜，清泉岛水便宜。在云港和工坊城的「改装」页可以升级锅炉、气囊、螺旋桨、货舱、装甲并更换涂装。易碎品怕撞、加急件限时、超重货吃浮力。没钱没煤时可连按两次 H 呼叫拖船，绝不会困死在空中。夜里按 L 开探照灯；小心雷暴（小地图红区）与载货时出没的空贼（J 抛货引开）。v1.2 起可在改装页购买武器（机炮 / 鱼叉 / 照明弹），承接护航与悬赏委托——战斗完全可选。v1.3 新增北方的霜原群岛（气囊 Lv3 才能飞越强风墙）、冰鲜与跨区长途委托，以及云港 / 工坊城 / 冰港「船坞」里的轻型快艇与巨型运输舰；完成主线第五章后开启霜原篇「霜原来信」。</p>
      </div>
      <div className="foot">v1.3.0 · 云港航运</div>
    </div>
  )
}

function PauseMenu() {
  const { resume, toMenu, openSheet } = useGame()
  const cards = useStory((s) => s.cards.length)
  if (cards) return null
  return (
    <div className="overlay pause">
      <div className="panel brass pause-panel">
        <h2>暂停</h2>
        <button className="primary" onClick={resume}>继续</button>
        <div className="menu-row">
          <button onClick={() => openSheet('log')}>📜 航运日志</button>
          <button onClick={() => openSheet('achv')}>🏆 成就</button>
          <button onClick={() => openSheet('settings')}>⚙ 设置</button>
        </div>
        <button onClick={toMenu}>返回主菜单</button>
        <ControlsTable />
      </div>
    </div>
  )
}

/** 罗盘刻度带 */
function Compass({ heading }: { heading: number }) {
  const marks: { deg: number; label: string; major: boolean }[] = []
  const names: Record<number, string> = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' }
  for (let d = -90; d <= 450; d += 15) {
    const n = ((d % 360) + 360) % 360
    marks.push({ deg: d, label: names[n] ?? String(n), major: n in names })
  }
  const PX = 3 // 每度像素
  return (
    <div className="compass brass-frame">
      <div className="tape" style={{ transform: `translateX(${-heading * PX}px)` }}>
        {marks.map((m) => (
          <span key={m.deg} className={m.major ? 'major' : ''} style={{ left: m.deg * PX }}>
            <i />{m.label}
          </span>
        ))}
      </div>
      <div className="needle" />
      <b className="hdg">{Math.round(heading).toString().padStart(3, '0')}°</b>
    </div>
  )
}

/** 锅炉压力表：黄铜指针=实际，红色三角=目标 */
function PressureGauge({ p, t, n }: { p: number; t: number; n: number }) {
  const cx = 80, cy = 80
  const pt = (v: number, r: number) => {
    const a = ((-120 + 240 * v) * Math.PI) / 180
    return [cx + Math.sin(a) * r, cy - Math.cos(a) * r] as const
  }
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${(v1 - v0) * 240 > 180 ? 1 : 0} 1 ${x1} ${y1}`
  }
  const [nx, ny] = pt(p, 52)
  const [tx, ty] = pt(t, 66)
  const ta = -120 + 240 * t
  return (
    <svg className="gauge" viewBox="0 0 160 160">
      <defs>
        <radialGradient id="face" cx="50%" cy="45%" r="60%"><stop offset="0%" stopColor="#f6e7c4" /><stop offset="100%" stopColor="#d7bf8c" /></radialGradient>
        <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f2cf7c" /><stop offset="50%" stopColor="#a86b2c" /><stop offset="100%" stopColor="#e8b45e" /></linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={77} fill="url(#rim)" />
      <circle cx={cx} cy={cy} r={70} fill="url(#face)" stroke="#5a3418" strokeWidth={1.5} />
      <path d={arc(0, 0.35, 60)} stroke="#6f86a8" strokeWidth={6} fill="none" opacity={0.7} />
      <path d={arc(n - 0.05, n + 0.05, 60)} stroke="#4f9a5a" strokeWidth={6} fill="none" opacity={0.85} />
      <path d={arc(0.85, 1, 60)} stroke="#c0392b" strokeWidth={6} fill="none" opacity={0.85} />
      {Array.from({ length: 11 }, (_, i) => {
        const [x0, y0] = pt(i / 10, i % 5 === 0 ? 50 : 54), [x1, y1] = pt(i / 10, 63)
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#3b2412" strokeWidth={i % 5 === 0 ? 2.2 : 1.2} />
      })}
      {[0, 50, 100].map((v) => { const [x, y] = pt(v / 100, 40); return <text key={v} x={x} y={y + 4} textAnchor="middle" className="gt">{v}</text> })}
      <polygon points={`${tx},${ty} ${tx - 5},${ty - 9} ${tx + 5},${ty - 9}`} fill="#c0392b" stroke="#5a1a10" strokeWidth={0.8} transform={`rotate(${ta} ${tx} ${ty})`} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#2b1a0e" strokeWidth={3.2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#b8803a" stroke="#3b2412" />
      <text x={cx} y={cy + 26} textAnchor="middle" className="gv">{Math.round(p * 100)}%</text>
      <text x={cx} y={cy + 40} textAnchor="middle" className="gl">锅炉压力</text>
    </svg>
  )
}

/** 主机传令钟式档位表 */
function Telegraph({ gear, prop }: { gear: number; prop: number }) {
  const gears: number[] = []
  for (let g = GEAR_MAX; g >= GEAR_MIN; g--) gears.push(g)
  return (
    <div className="telegraph">
      <div className="tg-title">推进档位</div>
      {gears.map((g) => (
        <div key={g} className={`tg-row ${g === gear ? 'on' : ''} ${g < 0 ? 'rev' : ''}`}>
          <b>{g}</b><span>{GEAR_NAMES[String(g)]}</span>
        </div>
      ))}
      <div className="rpm"><i style={{ left: prop >= 0 ? '30%' : `${30 + prop * 30 / 0.45}%`, width: `${Math.abs(prop >= 0 ? prop * 70 : prop * 30 / 0.45)}%` }} /></div>
      <small>桨速 {Math.round(prop * 100)}%</small>
    </div>
  )
}

function AltBar({ alt, ceil, rec }: { alt: number; ceil: number; rec?: number | null }) {
  const y = (v: number) => `${100 - Math.max(0, Math.min(1, v / (Math.max(CEILING, ceil) + 20))) * 100}%`
  return (
    <div className="altbar">
      <span className="mk ceil" style={{ top: y(ceil) }}>升限</span>
      <span className="mk port" style={{ top: y(PORT.top) }}>港口</span>
      <span className="mk cloud" style={{ top: y(SINK_Y) }}>云海</span>
      {rec != null && <span className="mk rec" style={{ top: y(rec) }}>建议</span>}
      <i className="cur" style={{ top: y(alt) }} />
    </div>
  )
}

/** 煤 / 水 玻璃管表 */
function FuelTubes({ coal, water, endurance }: { coal: number; water: number; endurance: number }) {
  const tube = (label: string, v: number, cls: string) => (
    <div className={`tube ${cls} ${v < FUEL.low ? 'low' : ''}`}>
      <div className="glass"><i style={{ height: `${v * 100}%` }} />{[0.25, 0.5, 0.75].map((t) => <s key={t} style={{ bottom: `${t * 100}%` }} />)}</div>
      <b>{label}</b>
      <small>{Math.round(v * 100)}%</small>
    </div>
  )
  const m = Math.floor(endurance / 60), sec = Math.floor(endurance % 60)
  return (
    <div className="fuel">
      <div className="tubes">{tube('煤', coal, 'coal')}{tube('水', water, 'water')}</div>
      <div className="endur">{coal > 0 ? `续航 ${m}:${String(sec).padStart(2, '0')}` : '锅炉熄火'}</div>
    </div>
  )
}

/** 风向指示：船头朝上，箭头为风吹去的方向 */
function WindDial({ w }: { w: Readout['wind'] }) {
  const ang = (Math.atan2(w.right, w.fwd) * 180) / Math.PI
  const rel = w.speed < 0.8 ? '微风' : w.fwd > w.speed * 0.6 ? '顺风' : w.fwd < -w.speed * 0.6 ? '逆风' : w.right > 0 ? '左舷侧风' : '右舷侧风'
  const len = 8 + Math.min(1, w.speed / 10) * 14
  return (
    <div className="ro wind">
      <small>风</small>
      <svg viewBox="-30 -30 60 60" className="wdial">
        <circle r={27} fill="rgba(0,0,0,.35)" stroke="#d6a54e" strokeWidth={1.5} />
        <path d="M0,-9 L4,5 L0,3 L-4,5 Z" fill="#8a6a4a" opacity={0.8} />
        <g transform={`rotate(${ang})`}>
          <line x1={0} y1={len} x2={0} y2={-len} stroke="#9fd8ff" strokeWidth={2.5} strokeLinecap="round" />
          <path d={`M0,${-len - 6} L5,${-len + 2} L-5,${-len + 2} Z`} fill="#9fd8ff" />
        </g>
      </svg>
      <div className="wtxt"><b>{w.speed.toFixed(1)}</b><em>米/秒 · {rel}</em>{w.zone && <i>{w.zone}</i>}</div>
    </div>
  )
}

function MoneyBox() {
  const money = useEco((s) => s.money)
  const cargo = useEco((s) => s.cargo)
  const maxW = useEco((s) => s.maxWeight)
  const hp = useEco((s) => s.hp)
  const armor = useEco((s) => s.parts.armor)
  const hull = useEco((s) => s.hull)
  const max = hullHpMax(hull, armor)
  return (
    <div className="money brass-frame">
      <Coin v={money} />
      <small>银币 · {HULLS[hull]?.name ?? '标准货船'} · 载重 {cargoWeight(cargo).toFixed(1)}/{maxW} 吨</small>
      <div className={`hpbar ${hp < max * 0.3 ? 'low' : ''}`}><span>船体</span><div className="bar"><i style={{ width: `${Math.min(1, hp / max) * 100}%` }} /></div><span>{Math.round(Math.min(hp, max))}/{max}</span></div>
    </div>
  )
}

function CargoHud() {
  const cargo = useEco((s) => s.cargo)
  const slots = useEco((s) => s.slots)
  if (!cargo.length) return null
  return (
    <div className="cargo-hud brass-frame">
      <div className="ch-title"><span>货舱委托</span><span>{cargo.length}/{slots} 货位</span></div>
      {cargo.map((c) => <CargoRow key={c.id} c={c} compact />)}
    </div>
  )
}

/** 指向最近的交货目的地 */
function DestArrow({ heading, adv }: { heading: number; adv: RouteAdvice | null }) {
  const cargo = useEco((s) => s.cargo)
  if (!cargo.length) return null
  let best = '', bd = Infinity
  for (const c of cargo) {
    const d = dockOf(c.to)
    const dist = Math.hypot(d.x - ship.pos.x, d.z - ship.pos.z)
    if (dist < bd) { bd = dist; best = c.to }
  }
  const d = dockOf(best)
  const brg = (-Math.atan2(d.x - ship.pos.x, d.z - ship.pos.z) * 180) / Math.PI
  const rel = brg - heading
  const n = cargo.filter((c) => c.to === best).length
  return (
    <div className="dest-arrow brass-frame">
      <svg viewBox="-15 -15 30 30"><g transform={`rotate(${rel})`}><path d="M0,-12 L8,6 L0,2 L-8,6 Z" fill="#ffd166" stroke="#5a3418" strokeWidth={1.2} /></g></svg>
      <div className="dest-txt">
        <span>目的地 <b>{islandName(best)}</b> · {fmtDist(bd)}{n > 1 ? ` · ${n} 件` : ''}</span>
        {adv && adv.dest === best && (
          <small className={`route-tip ${adv.tail > 0.8 ? 'good' : adv.tail < -0.8 ? 'bad' : ''}`}>
            建议高度 <b>{adv.alt}</b> 米 · {tailLabel(adv.tail)}{Math.abs(adv.alt - ship.pos.y) < 20 ? ' · 保持当前高度' : adv.save > 5 ? ` · 约快 ${Math.round(adv.save)} 秒` : ''}
          </small>
        )}
      </div>
    </div>
  )
}

function PirateAlert({ p }: { p: NonNullable<ReturnType<typeof hazardReadout>['pirate']> }) {
  const w = useEco((s) => s.weapons)
  const armed = (w?.gun ?? 0) + (w?.harpoon ?? 0) > 0
  const msg = p.state === 'flee' ? '空贼正在离开' : p.state === 'loot' ? '空贼掉头去捞抛下的货物' : p.blind ? '空贼被照明弹晃花了眼——快跑！' : p.high ? `飞得太高（>${PIRATE_CEIL + 40} 米），空贼够不着` : p.dist < GRAPPLE_R ? '钩索射程内！快甩开！' : '空贼追击中'
  return (
    <div className={`pirate-alert brass-frame ${p.state === 'chase' && p.dist < GRAPPLE_R ? 'hot' : ''}`}>
      <b>☠</b>
      <div>
        <span>{msg} · 距离 <em>{Math.round(p.dist)}</em> 米</span>
        <div className="grapple"><i style={{ width: `${p.grapple * 100}%` }} /><small>钩索 {Math.round(p.grapple * 100)}%</small></div>
        {armed && <div className="grapple foe-hp"><i style={{ width: `${(p.hp / p.maxHp) * 100}%` }} /><small>敌船耐久 {Math.max(0, Math.round(p.hp))}/{p.maxHp}</small></div>}
        <small className="soft">全速甩开 · 顺风 · 爬升到 {PIRATE_CEIL + 40} 米以上 · 躲进雷暴或港口 · J 抛货引开{(w?.flare ?? 0) > 0 ? ' · Z 照明弹' : ''}{armed ? ' · C 开火还击' : ' · 它会开炮威慑'}</small>
      </div>
    </div>
  )
}

function Notes() {
  const notes = useEco((s) => s.notes)
  const port = useGame((s) => s.screen !== 'play')
  return <div className={`notes ${port ? 'top' : ''}`}>{notes.map((n) => <div key={n.id} className={`toast ${n.bad ? 'bad' : ''}`}>{n.text}</div>)}</div>
}

type Banner = { name: string; desc: string; key: number }

function Hud() {
  const showHint = useSettings((s) => s.showHint)
  const [r, setR] = useState<Readout>(() => shipReadout())
  const routeOn = useSettings((s) => s.routeAssist)
  const inputMode = useInput((s) => s.mode)
  const [adv, setAdv] = useState<RouteAdvice | null>(null)
  useEffect(() => {
    if (!routeOn) { setAdv(null); route.advice = null; return }
    const f = () => setAdv(computeRoute())
    f()
    const id = setInterval(f, 1000)
    return () => clearInterval(id)
  }, [routeOn])
  const [hz, setHz] = useState(() => hazardReadout())
  const view = useGame((s) => s.view)
  const [viewToast, setViewToast] = useState(false)
  const first = useRef(true)
  const [banner, setBanner] = useState<Banner | null>(null)
  const shown = useRef<string | null>(null)
  const mapMode = useGame((s) => s.mapMode)
  const [mapToast, setMapToast] = useState(false)
  const firstMap = useRef(true)
  useEffect(() => {
    const id = setInterval(() => {
      const nr = shipReadout()
      setR(nr)
      setHz(hazardReadout())
      // 到达横幅：进入某岛 150 米内显示一次，离开 350 米后重置
      const isl = nr.nearest.island
      if (nr.nearest.dist < 150 && shown.current !== isl.id) {
        shown.current = isl.id
        setBanner({ name: isl.name, desc: isl.desc, key: Date.now() })
      } else if (shown.current === isl.id && nr.nearest.dist > 350) shown.current = null
    }, 80)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(null), 4200)
    return () => clearTimeout(id)
  }, [banner])
  useEffect(() => {
    if (firstMap.current) { firstMap.current = false; return }
    setMapToast(true)
    const id = setTimeout(() => setMapToast(false), 1300)
    return () => clearTimeout(id)
  }, [mapMode])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setViewToast(true)
    const id = setTimeout(() => setViewToast(false), 1500)
    return () => clearTimeout(id)
  }, [view])
  const ni = r.nearest
  const status = r.docked ? `已系泊 · ${r.dockName}栈桥` : ni.dist < 40 ? `航行中 · ${ni.island.name}上空` : `航行中 · 最近：${ni.island.name} ${ni.dist >= 1000 ? (ni.dist / 1000).toFixed(2) + ' 千米' : Math.round(ni.dist) + ' 米'}`
  return (
    <div className="hud">
      <Compass heading={r.heading} />
      <div className="status brass-frame">
        <b>{r.docked ? '⚓' : '⛭'}</b>
        <div><span>{status}</span>{r.wind.zone && <small>身处气流带：{r.wind.zone}</small>}{r.cold > 0.15 && <small className="cold-tag">❄ 寒冷 · 耗煤 +{r.coldPct}%{r.coldKit ? '（防寒罩）' : ' · 可在冰港 / 云港 / 工坊城装防寒锅炉罩'}</small>}<em className="clock">🕓 {fmtTod(env.tod)} · {periodName(env.tod)}{env.searchlight ? ' · 探照灯' : ''}</em></div>
      </div>
      {mapMode !== 'off' && <Minimap mode={mapMode} />}
      {banner && (
        <div className="banner" key={banner.key}>
          <small>— 抵达 —</small>
          <h2>{banner.name}</h2>
          <p>{banner.desc}</p>
        </div>
      )}
      <div className="warns">
        {r.warns.map((w) => <div key={w} className={`warn ${/坠入|已空|强风墙！/.test(w) ? 'danger' : /强风墙/.test(w) ? 'info' : ''}`}>{w}</div>)}
        {r.canDock && <div className="warn info dock">按 {inputMode === 'pad' ? 'Ⓐ' : 'E'} 靠泊 · {r.canDock}栈桥</div>}
        {hz.storm && hz.storm.k > 0.05 && <div className="warn danger">⚡ 身处雷暴！湍流与下沉气流 · 随时可能遭雷击{r.alt < 470 ? ' · 爬升到 470 米以上可越过' : ''}</div>}
        {hz.storm && hz.storm.k <= 0.05 && hz.storm.d < 450 && !r.docked && <div className="warn">⚡ 前方雷暴 · 距离 {Math.max(0, Math.round(hz.storm.d))} 米</div>}
        {hz.fog > 0.5 && <div className="warn info">🌫 浓雾 · 能见度极低，依靠罗盘、小地图与灯塔光束</div>}
        {r.wrecked && <div className="warn danger">船体耐久耗尽 · 推力受限，请靠港修理</div>}
        {r.coal <= 0 && !r.docked && <div className="warn danger">锅炉熄火！连按两次 H 呼叫拖船</div>}
        {!r.canDock && r.nearDock && r.dockReason && <div className="warn info soft">接近{r.nearDock}栈桥 · {r.dockReason}</div>}
        {mapToast && <div className="warn info">{MAP_NAMES[mapMode]}</div>}
        {r.bump > 0.15 && <div className="warn bump">船体碰撞！</div>}
        {r.docked && <div className="warn info soft">已系泊：按 {inputMode === 'pad' ? 'Ⓐ' : 'E'} 打开港口面板 · 调整锅炉压力或挂档即可解缆起航</div>}
        {viewToast && <div className="warn info">{VIEW_NAMES[view]}</div>}
      </div>
      <div className="panel-l brass-panel">
        <div className="gauge-wrap">
          <PressureGauge p={r.pressure} t={r.target} n={r.neutral} />
          <div className="press-txt">
            <span>目标 <b className="tgt">{Math.round(r.target * 100)}%</b></span>
            <span>实际 <b>{Math.round(r.pressure * 100)}%</b></span>
            <span className="note">{Math.abs(r.target - r.neutral) < 0.03 ? `中性 ${Math.round(r.neutral * 100)}%` : r.target > r.neutral ? '上升' : '下降'}</span>
          </div>
        </div>
        <FuelTubes coal={r.coal} water={r.water} endurance={r.endurance} />
        <Telegraph gear={r.gear} prop={r.prop} />
      </div>
      <div className="panel-r brass-panel">
        <div className="readouts">
          <div className="ro"><small>航速</small><b>{r.speed.toFixed(1)}</b><em>节</em></div>
          <div className="ro"><small>高度</small><b>{Math.round(r.alt)}</b><em>米</em></div>
          <div className="ro"><small>升降</small><b className={r.vs > 0.2 ? 'up' : r.vs < -0.2 ? 'down' : ''}>{r.vs > 0.05 ? '↑' : r.vs < -0.05 ? '↓' : '·'}{Math.abs(r.vs).toFixed(1)}</b><em>米/秒</em></div>
          <WindDial w={r.wind} />
          <div className="ro rud"><small>舵角</small><div className="rudbar"><i style={{ left: `${50 - r.rudder * 45}%` }} /></div><em>{r.rudder > 0.05 ? '左' : r.rudder < -0.05 ? '右' : '正'}</em></div>
        </div>
        <AltBar alt={r.alt} ceil={r.ceiling} rec={adv && !r.docked ? adv.alt : null} />
      </div>
      {hz.pirate && <PirateAlert p={hz.pirate} />}
      <MoneyBox />
      <div className="left-col">
        <CombatHud part="mission" />
        <CargoHud />
      </div>
      <CombatHud part="main" />
      <TargetMarks />
      {mapMode !== 'full' && mapMode !== 'world' && <StoryTracker />}
      <DestArrow heading={r.heading} adv={adv} />
      <Fps />
      {showHint && <div className="hint">{inputMode === 'pad' ? HINT_PAD : HINT_KB}</div>}
    </div>
  )
}

function Fps() {
  const show = useSettings((s) => s.showFps)
  const [f, setF] = useState(0)
  useEffect(() => { if (!show) return; const id = setInterval(() => setF(perf.fps), 400); return () => clearInterval(id) }, [show])
  if (!show) return null
  return <div className={`fps ${f < 30 ? 'low' : ''}`}>{Math.round(f)} FPS</div>
}

export function Ui() {
  const screen = useGame((s) => s.screen)
  const sheet = useGame((s) => s.sheet)
  return (
    <>
      {screen !== 'menu' && screen !== 'photo' && <Hud />}
      {screen === 'photo' && <PhotoPanel />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'paused' && <PauseMenu />}
      {screen === 'port' && <PortPanel />}
      {screen !== 'menu' && <SettlementCard />}
      {sheet === 'achv' && <AchvSheet />}
      {sheet === 'log' && <LogSheet />}
      {sheet === 'settings' && <SettingsSheet />}
      <StoryCard />
      <Fanfares />
      <Notes />
    </>
  )
}
