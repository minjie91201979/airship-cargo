import { FILTERS, exitPhoto, savePhoto, usePhoto, type Filter } from '../game/photo'
import { fmtTod } from '../game/env'
import { useInput } from '../game/pad'

function Row({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (v: number) => string; on: (v: number) => void }) {
  return (
    <label className="ph-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} onKeyDown={(e) => e.currentTarget.blur()} />
      <em>{fmt(v)}</em>
    </label>
  )
}

/** 照相模式面板 + 暗角预览 */
export function PhotoPanel() {
  const p = usePhoto()
  const mode = useInput((s) => s.mode)
  const set = usePhoto.setState
  return (
    <>
      <div className="ph-vignette" style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(75 - p.vignette * 40)}%, rgba(10,6,2,${(0.25 + p.vignette * 0.65).toFixed(2)}) 100%)`, opacity: p.vignette > 0.01 ? 1 : 0 }} />
      {!p.hidePanel && (
        <div className="panel brass photo-panel">
          <div className="ph-head"><b>📷 照相模式</b><small>模拟已冻结</small></div>
          <div className="ph-filters">
            {(Object.keys(FILTERS) as Filter[]).map((f) => <button key={f} className={p.filter === f ? 'small primary' : 'small'} onClick={() => set({ filter: f })}>{FILTERS[f]}</button>)}
          </div>
          <Row label="时刻" v={p.tod} min={0} max={23.99} step={0.05} fmt={(v) => fmtTod(v)} on={(v) => set({ tod: v })} />
          <Row label="曝光" v={p.exposure} min={0.6} max={1.5} step={0.02} fmt={(v) => `×${v.toFixed(2)}`} on={(v) => set({ exposure: v })} />
          <Row label="暗角" v={p.vignette} min={0} max={1} step={0.02} fmt={(v) => `${Math.round(v * 100)}%`} on={(v) => set({ vignette: v })} />
          <Row label="视野" v={p.fov} min={25} max={90} step={1} fmt={(v) => `${v}°`} on={(v) => set({ fov: v })} />
          <div className="ph-btns">
            <button className="small primary" onClick={savePhoto}>保存截图（{mode === 'pad' ? 'Ⓐ' : 'Enter'}）</button>
            <button className="small" onClick={exitPhoto}>退出（{mode === 'pad' ? 'Ⓑ' : 'P / Esc'}）</button>
          </div>
          <small className="soft ph-help">
            {mode === 'pad'
              ? '左摇杆 移动 · 右摇杆 转向 · RT/LT 升降 · Ⓐ 截图 · Ⓑ / RB 退出'
              : 'WASD 移动 · 拖拽鼠标 转向 · E/Q 升降 · Shift 加速 · Enter 截图 · H 隐藏面板 · P/Esc 退出'}
          </small>
        </div>
      )}
      {p.hidePanel && <div className="ph-mini">照相模式 · H 显示面板 · Enter 截图 · P 退出</div>}
    </>
  )
}
