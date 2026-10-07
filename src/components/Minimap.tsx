import { useEffect, useRef } from 'react'
import { ship } from '../game/flight'
import { CURRENTS, windAt, type WindSample } from '../game/wind'
import { useEco, dockOf } from '../game/economy'
import { FOG_BANKS, bankStrength, env } from '../game/env'
import { pirate, storms, stormLife } from '../game/hazards'
import { foes, npc } from '../game/combat'
import { CORRIDOR, FROST, ISLANDS, PORT, WALL, WORLD_R, pierZ1, rotY } from '../game/world'
import type { MapMode } from '../game/store'
import { route } from '../game/route'
import { useSettings } from '../game/settings'
import { currentDir, currentStrength } from '../game/wind'

/**
 * 小地图（画布）。北（+Z）朝上；按罗盘约定东在右侧，即世界 -X 方向画在右边。
 * near：以飞艇为中心半径 750 米；full：整个群岛。
 */
const SIZE = { near: 200, full: 520, world: 560 }
const RANGE = { near: 750, full: 2500, world: 3950 }
/** 飞艇所在的大区：风墙以北算霜原 */
const inFrost = () => ship.pos.z > (WALL.z0 + WALL.z1) / 2
const ws: WindSample = { x: 0, z: 0, speed: 0, zone: null }

export function Minimap({ mode }: { mode: Exclude<MapMode, 'off'> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const S = SIZE[mode]
    cv.width = S * dpr
    cv.height = S * dpr
    const ctx = cv.getContext('2d')!
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, S, S)
      const full = mode !== 'near'
      const world = mode === 'world'
      const frostView = mode === 'full' && inFrost()
      const RG = world ? RANGE.world : frostView ? 1350 : RANGE[mode]
      const ox = world ? 0 : frostView ? FROST.x : full ? 0 : ship.pos.x, oz = world ? 1500 : frostView ? FROST.z : full ? 0 : ship.pos.z
      const k = S / 2 / RG
      if (titleRef.current) { const t = world ? '世界总图 · 云港群岛 ⇄ 霜原群岛' : frostView ? '霜原群岛航图' : '云港群岛航图'; if (titleRef.current.textContent !== t) titleRef.current.textContent = t }
      const cx = S / 2, cy = S / 2
      const P = (x: number, z: number): [number, number] => [cx - (x - ox) * k, cy - (z - oz) * k]
      ctx.save()
      ctx.beginPath()
      if (full) ctx.rect(0, 0, S, S)
      else ctx.arc(cx, cy, S / 2, 0, Math.PI * 2)
      ctx.clip()
      // 羊皮纸底色
      const g = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 0.75)
      g.addColorStop(0, '#f1e0b6')
      g.addColorStop(1, '#c9a872')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, S, S)
      // 网格（每 500 米）
      ctx.strokeStyle = 'rgba(110,70,30,.15)'
      ctx.lineWidth = 1
      const step = world ? 1000 : 500
      for (let gx = Math.floor((ox - RG) / step) * step; gx <= ox + RG; gx += step) {
        const [x] = P(gx, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke()
      }
      for (let gz = Math.floor((oz - RG) / step) * step; gz <= oz + RG; gz += step) {
        const [, y] = P(0, gz); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke()
      }
      // 航区边界：云港圆 ∪ 风墙走廊 ∪ 霜原圆
      {
        const [bx, by] = P(0, 0)
        const [fx, fy] = P(FROST.x, FROST.z)
        ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(170,40,30,.6)'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(bx, by, WORLD_R * k, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath(); ctx.arc(fx, fy, FROST.r * k, 0, Math.PI * 2); ctx.stroke()
        const [c0x, c0y] = P(CORRIDOR.x, CORRIDOR.z0), [c1x, c1y] = P(-CORRIDOR.x, CORRIDOR.z1)
        ctx.strokeRect(Math.min(c0x, c1x), Math.min(c0y, c1y), Math.abs(c1x - c0x), Math.abs(c1y - c0y))
        ctx.setLineDash([])
        // 霜原地面色
        const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, FROST.r * k)
        g2.addColorStop(0, 'rgba(225,238,248,.55)'); g2.addColorStop(1, 'rgba(225,238,248,0)')
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(fx, fy, FROST.r * k, 0, Math.PI * 2); ctx.fill()
        // 强风墙
        const [w0x, w0y] = P(WALL.x, WALL.z0), [w1x, w1y] = P(-WALL.x, WALL.z1)
        const wx = Math.min(w0x, w1x), wy = Math.min(w0y, w1y), ww = Math.abs(w1x - w0x), wh = Math.abs(w1y - w0y)
        if (wy < S + 20 && wy + wh > -20) {
          ctx.fillStyle = 'rgba(90,130,190,.22)'; ctx.fillRect(wx, wy, ww, wh)
          ctx.strokeStyle = 'rgba(60,100,170,.5)'; ctx.lineWidth = 1
          ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip()
          for (let i = -wh; i < ww; i += 9) { ctx.beginPath(); ctx.moveTo(wx + i, wy + wh); ctx.lineTo(wx + i + wh, wy); ctx.stroke() }
          ctx.restore()
          if (full) {
            ctx.font = 'bold 12px "Noto Serif SC", serif'; ctx.textAlign = 'center'
            const ty = wy + wh / 2 + 4
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(241,234,220,.9)'
            const label = `🌬 强风墙 · ${WALL.alt} 米以上高空通道（升限 ≥${WALL.ceil}）`
            ctx.strokeText(label, cx, ty); ctx.fillStyle = '#1e3c6e'; ctx.fillText(label, cx, ty)
          }
        }
      }
      // 气流带
      if (full) {
        ctx.font = 'italic 11px serif'; ctx.textAlign = 'center'
        for (const c of CURRENTS) {
          const [x, y] = P(c.x, c.z)
          ctx.fillStyle = 'rgba(70,120,170,.08)'; ctx.strokeStyle = 'rgba(70,120,170,.35)'
          ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(x, y, c.r * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([])
          ctx.fillStyle = 'rgba(40,80,130,.75)'
          ctx.fillText(`${c.name} ${c.y0}~${c.y1}米`, x, y - c.r * k * 0.55)
        }
      }
      // 风向箭头（飞艇当前高度）
      const ws_ = world ? 650 : full ? 360 : 220
      ctx.strokeStyle = 'rgba(40,90,150,.55)'; ctx.fillStyle = 'rgba(40,90,150,.55)'; ctx.lineWidth = 1.3
      for (let gx = Math.floor((ox - RG) / ws_) * ws_; gx <= ox + RG; gx += ws_) {
        for (let gz = Math.floor((oz - RG) / ws_) * ws_; gz <= oz + RG; gz += ws_) {
          windAt(gx, ship.pos.y, gz, ship.time, ws)
          const [x, y] = P(gx, gz)
          const L = Math.min(16, 3 + ws.speed * 1.6) * (full ? 1 : 0.9)
          const dx = -ws.x / (ws.speed || 1), dy = -ws.z / (ws.speed || 1)
          const x0 = x - dx * L / 2, y0 = y - dy * L / 2, x1 = x + dx * L / 2, y1 = y + dy * L / 2
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - dx * 4 - dy * 3, y1 - dy * 4 + dx * 3); ctx.lineTo(x1 - dx * 4 + dy * 3, y1 - dy * 4 - dx * 3); ctx.fill()
        }
      }
      // 岛屿
      ctx.textAlign = 'center'
      for (const isl of ISLANDS) {
        const [x, y] = P(isl.x, isl.z)
        const r = Math.max(4, isl.R * k)
        if (x < -60 || x > S + 60 || y < -40 || y > S + 40) continue
        // 栈桥
        const [pdx, pdz] = rotY(0, pierZ1(isl), isl.pier)
        const [qx, qy] = P(isl.x + pdx, isl.z + pdz)
        ctx.strokeStyle = '#6a4528'; ctx.lineWidth = Math.max(1.5, 5 * k * 1.4)
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(qx, qy); ctx.stroke()
        ctx.fillStyle = isl.id === PORT.id ? '#9fb85a' : isl.snow ? '#eef3f8' : (isl.grass ?? '#8fae5a')
        ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        if (isl.id === PORT.id) {
          ctx.fillStyle = '#b0432f'; ctx.font = 'bold 11px serif'; ctx.fillText('★', x, y + 4)
        }
        ctx.font = `${world ? 'bold 10px' : full ? 'bold 13px' : 'bold 11px'} "Noto Serif SC", serif`
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(241,224,182,.9)'
        ctx.strokeText(isl.name, x, y - r - 4)
        ctx.fillStyle = '#3b2412'
        ctx.fillText(isl.name, x, y - r - 4)
        if (full && !world) {
          ctx.font = '10px serif'; ctx.fillStyle = 'rgba(59,36,18,.7)'
          ctx.fillText(`${isl.top} 米`, x, y + r + 11)
        }
      }
      // 雾区（灰色）与雷暴（红色）
      FOG_BANKS.forEach((b, i) => {
        const [x, y] = P(b.x, b.z)
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * k)
        const a = 0.42 * bankStrength(env.tod, i)
        g.addColorStop(0, `rgba(120,124,132,${a})`); g.addColorStop(0.6, `rgba(120,124,132,${a * 0.8})`); g.addColorStop(1, 'rgba(120,124,132,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, b.r * k, 0, Math.PI * 2); ctx.fill()
        if (full) { ctx.fillStyle = 'rgba(70,72,80,.8)'; ctx.font = 'italic 11px serif'; ctx.textAlign = 'center'; ctx.fillText(b.name, x, y + 4) }
      })
      for (const st of storms) {
        const [x, y] = P(st.x, st.z)
        const l = stormLife(st)
        const g = ctx.createRadialGradient(x, y, 0, x, y, st.r * k)
        g.addColorStop(0, `rgba(190,30,20,${0.45 * l})`); g.addColorStop(0.7, `rgba(190,30,20,${0.3 * l})`); g.addColorStop(1, 'rgba(190,30,20,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, st.r * k, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = `rgba(160,20,10,${0.7 * l})`; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(x, y, st.r * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = `rgba(120,10,0,${l})`; ctx.font = `bold ${full ? 14 : 12}px serif`; ctx.textAlign = 'center'; ctx.fillText('⚡', x, y + 5)
      }
      // 航线辅助：顺风 / 逆风气流带高亮 + 虚线航线（按建议高度的顺风分量着色）
      const adv = useSettings.getState().routeAssist ? route.advice : null
      if (adv) {
        const [dx, dz] = adv.dir
        const sx = ship.pos.x, sz = ship.pos.z
        for (const c of CURRENTS) {
          if (adv.alt < c.y0 - 30 || adv.alt > c.y1 + 30) continue
          // 航线与气流带中心的最近距离
          const t = Math.max(0, Math.min(adv.dist, (c.x - sx) * dx + (c.z - sz) * dz))
          const near = Math.hypot(sx + dx * t - c.x, sz + dz * t - c.z)
          if (near > c.r * 0.85) continue
          const a = currentDir(c, ship.time)
          const tail = (Math.sin(a) * dx + Math.cos(a) * dz) * currentStrength(c, ship.time)
          if (Math.abs(tail) < 1) continue
          const good = tail > 0
          const [x, y] = P(c.x, c.z)
          const g = ctx.createRadialGradient(x, y, 0, x, y, c.r * k)
          g.addColorStop(0, good ? 'rgba(60,170,80,.26)' : 'rgba(200,70,40,.14)')
          g.addColorStop(0.7, good ? 'rgba(60,170,80,.16)' : 'rgba(200,70,40,.08)')
          g.addColorStop(1, 'rgba(60,170,80,0)')
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, c.r * k, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = good ? 'rgba(40,130,60,.75)' : 'rgba(170,60,30,.55)'; ctx.lineWidth = 2; ctx.setLineDash([2, 4])
          ctx.beginPath(); ctx.arc(x, y, c.r * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
          ctx.font = `bold ${full ? 12 : 10}px serif`; ctx.textAlign = 'center'
          ctx.fillStyle = good ? 'rgba(25,100,45,.95)' : 'rgba(150,50,20,.85)'
          const ly = full ? y + c.r * k * 0.55 : Math.max(24, Math.min(S - 24, y))
          const lx = full ? x : Math.max(40, Math.min(S - 40, x))
          ctx.fillText(`${good ? '顺风带' : '逆风带'} · ${c.name}`, lx, ly)
        }
        // 虚线航线
        const pts = [[sx, sz], ...adv.seg.map((q) => [q.x + dx * adv.dist / adv.seg.length / 2, q.z + dz * adv.dist / adv.seg.length / 2])]
        ctx.lineCap = 'round'
        for (let i = 0; i < adv.seg.length; i++) {
          const [x0, y0] = P(pts[i][0], pts[i][1]), [x1, y1] = P(pts[i + 1][0], pts[i + 1][1])
          const tl = adv.seg[i].tail
          ctx.strokeStyle = 'rgba(255,248,225,.85)'; ctx.lineWidth = 4.5; ctx.setLineDash([])
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          ctx.strokeStyle = tl > 0.8 ? '#2f8f46' : tl < -0.8 ? '#c0452a' : '#b8862e'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4])
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
        }
        ctx.setLineDash([]); ctx.lineCap = 'butt'
      }
      // 交货目的地：金色圆环
      {
        const dests = new Set(useEco.getState().cargo.map((c) => c.to))
        const t = performance.now() / 1000
        for (const id of dests) {
          const d = dockOf(id)
          const isl = d.island
          let [x, y] = P(isl.x, isl.z)
          const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 10
          if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 10); y = cy + Math.sin(a) * (S / 2 - 10) }
          const r = out ? 6 : Math.max(8, isl.R * k + 5) + Math.sin(t * 4) * 1.5
          ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 3
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
          ctx.strokeStyle = 'rgba(255,240,180,.9)'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.stroke()
          if (out) { ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill() }
        }
      }
      // v1.2 战斗委托：悬赏 / 黑帆锚地搜索区域、护航商船与目的地、敌船
      {
        const m = useEco.getState().mission
        const t = performance.now() / 1000
        if (m?.zone) {
          const [zx, zz, zr] = m.zone
          let [x, y] = P(zx, zz)
          const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 10
          if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 12); y = cy + Math.sin(a) * (S / 2 - 12) }
          ctx.fillStyle = 'rgba(200,40,20,.14)'; ctx.strokeStyle = 'rgba(190,30,15,.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4])
          ctx.beginPath(); ctx.arc(x, y, out ? 7 : Math.max(9, zr * k) + Math.sin(t * 3) * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([])
          ctx.fillStyle = '#7a0e06'; ctx.font = `bold ${full ? 12 : 10}px serif`; ctx.textAlign = 'center'
          ctx.fillText(m.mission === 'boss' ? '🏴 黑帆锚地' : `☠ 悬赏 ${m.foe ?? ''}`, x, y + (out ? -10 : 4))
        }
        if (m?.mission === 'escort') {
          const d = dockOf(m.to)
          let [x, y] = P(d.x, d.z)
          const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 10
          if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 10); y = cy + Math.sin(a) * (S / 2 - 10) }
          ctx.strokeStyle = '#3a8fd0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, out ? 6 : 12, 0, Math.PI * 2); ctx.stroke()
        }
        if (npc.active) {
          let [x, y] = P(npc.pos.x, npc.pos.z)
          const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 9
          if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 9); y = cy + Math.sin(a) * (S / 2 - 9) }
          ctx.save(); ctx.translate(x, y); ctx.rotate(-npc.yaw)
          ctx.fillStyle = '#3a8fd0'; ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke()
          ctx.restore()
        }
        for (const f of foes) {
          if (f.dead) continue
          let [x, y] = P(f.pos.x, f.pos.z)
          const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 8
          if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 8); y = cy + Math.sin(a) * (S / 2 - 8) }
          const r = f.kind === 'boss' ? 8 : f.kind === 'skiff' ? 3.5 : 5
          ctx.fillStyle = f.kind === 'boss' ? '#5a0a06' : '#1a1214'; ctx.strokeStyle = f.mode === 'flee' ? '#999' : '#ff3020'; ctx.lineWidth = 1.8
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          if (f.kind !== 'skiff') { ctx.fillStyle = '#f0e8d8'; ctx.font = `bold ${f.kind === 'boss' ? 10 : 8}px serif`; ctx.textAlign = 'center'; ctx.fillText('☠', x, y + 3) }
        }
      }
      // 空贼
      if (pirate.active && !pirate.dead) {
        let [x, y] = P(pirate.pos.x, pirate.pos.z)
        const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 9
        if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 9); y = cy + Math.sin(a) * (S / 2 - 9) }
        const pulse = 6 + Math.sin(performance.now() / 150) * 1.5
        ctx.fillStyle = '#1a1214'; ctx.strokeStyle = '#ff3020'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#f0e8d8'; ctx.font = 'bold 9px serif'; ctx.textAlign = 'center'; ctx.fillText('☠', x, y + 3)
      }
      // 飞艇
      {
        let [x, y] = P(ship.pos.x, ship.pos.z)
        const out = !full && Math.hypot(x - cx, y - cy) > S / 2 - 8
        if (out) { const a = Math.atan2(y - cy, x - cx); x = cx + Math.cos(a) * (S / 2 - 8); y = cy + Math.sin(a) * (S / 2 - 8) }
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(-ship.yaw)
        ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 1.5
        const s = full ? 1.2 : 1
        ctx.beginPath(); ctx.moveTo(0, -9 * s); ctx.lineTo(6 * s, 7 * s); ctx.lineTo(0, 4 * s); ctx.lineTo(-6 * s, 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.restore()
      }
      ctx.restore()
      // 北向标记
      ctx.font = 'bold 12px serif'; ctx.fillStyle = '#7a1e12'; ctx.textAlign = 'center'
      ctx.fillText('北', cx, 14)
      if (full) {
        ctx.font = '11px serif'; ctx.fillStyle = 'rgba(59,36,18,.8)'; ctx.textAlign = 'left'
        ctx.fillText(world ? '— 1000 米网格 · 按 M 切换：近景 → 本区全图 → 世界总图 → 关闭 · 北方为霜原群岛' : useSettings.getState().routeAssist && route.advice ? `— 500 米网格 · 蓝箭头为当前高度风向 · 虚线为建议航线（建议高度 ${route.advice.alt} 米：绿=顺风 黄=侧风 红=逆风）` : '— 500 米网格 · 蓝箭头为当前高度风向 · 红虚线为航区边界', 10, S - 10)
      } else {
        ctx.font = '10px serif'; ctx.fillStyle = 'rgba(59,36,18,.8)'
        ctx.fillText(`${RANGE.near * 2 / 1000} 千米`, cx, S - 8)
      }
    }
    draw()
    const id = setInterval(draw, 100)
    return () => clearInterval(id)
  }, [mode])
  return (
    <div className={`minimap ${mode} ${mode === 'world' ? 'full' : ''}`}>
      {mode !== 'near' && <div className="map-title" ref={titleRef}>云港群岛航图</div>}
      <canvas ref={ref} style={{ width: SIZE[mode], height: SIZE[mode] }} />
    </div>
  )
}
