import { useState } from 'react'
import { DEFAULT_SETTINGS, QUALITY_DESC, QUALITY_NAMES, useSettings, type Quality } from '../game/settings'
import { useGame } from '../game/store'
import { useEco } from '../game/economy'
import { useAchv, freshLife } from '../game/achv'

function Slider({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (v: number) => string; on: (v: number) => void }) {
  return (
    <label className="set-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} />
      <em>{fmt(v)}</em>
    </label>
  )
}
function Toggle({ label, v, on, desc }: { label: string; v: boolean; on: (v: boolean) => void; desc?: string }) {
  return (
    <div className="set-row">
      <span>{label}{desc && <small>{desc}</small>}</span>
      <button className={`toggle ${v ? 'on' : ''}`} onClick={() => on(!v)}><i />{v ? '开' : '关'}</button>
    </div>
  )
}

/** 设置面板（主菜单 / 暂停菜单） */
export function SettingsSheet() {
  const st = useSettings()
  const started = useEco((s) => s.started)
  const [confirm, setConfirm] = useState<'save' | 'achv' | null>(null)
  const close = () => useGame.getState().openSheet(null)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const mul = (v: number) => `×${v.toFixed(2)}`
  const wipeSave = () => {
    useEco.getState().wipe()
    setConfirm(null)
    useGame.getState().toMenu()
  }
  const wipeAchv = () => {
    useAchv.setState({ unlocked: {}, life: freshLife() })
    setConfirm(null)
  }
  return (
    <div className="overlay sheet-wrap">
      <div className="panel brass sheet settings-sheet">
        <div className="sheet-head"><div><small>— SETTINGS —</small><h2>设置</h2></div><small>设置会自动保存</small></div>
        <div className="set-cols">
          <section>
            <h4>音量</h4>
            <Slider label="主音量" v={st.master} min={0} max={1} step={0.05} fmt={pct} on={(v) => st.set({ master: v })} />
            <Slider label="音效（引擎 / 提示）" v={st.sfx} min={0} max={1} step={0.05} fmt={pct} on={(v) => st.set({ sfx: v })} />
            <Slider label="环境（风 / 雨 / 雷 / 钟）" v={st.ambient} min={0} max={1} step={0.05} fmt={pct} on={(v) => st.set({ ambient: v })} />
            <h4>画质</h4>
            <div className="q-row">
              {(['low', 'medium', 'high'] as Quality[]).map((q) => <button key={q} className={st.quality === q ? 'primary small' : 'small'} onClick={() => st.set({ quality: q })}>{QUALITY_NAMES[q]}</button>)}
            </div>
            <small className="soft q-desc">{QUALITY_DESC[st.quality]}</small>
            <h4>界面</h4>
            <Toggle label="底部按键提示行" v={st.showHint} on={(v) => st.set({ showHint: v })} />
            <Toggle label="显示帧率（FPS）" v={st.showFps} on={(v) => st.set({ showFps: v })} />
            <Toggle label="航线辅助" desc="建议巡航高度 · 小地图航线与顺风带" v={st.routeAssist} on={(v) => st.set({ routeAssist: v })} />
          </section>
          <section>
            <h4>操控</h4>
            <Slider label="转舵灵敏度" v={st.turnSens} min={0.5} max={1.6} step={0.05} fmt={mul} on={(v) => st.set({ turnSens: v })} />
            <Slider label="环视灵敏度" v={st.lookSens} min={0.4} max={2} step={0.05} fmt={mul} on={(v) => st.set({ lookSens: v })} />
            <Toggle label="环视上下反转" v={st.invertLook} on={(v) => st.set({ invertLook: v })} />
            <Toggle label="镜头震动" desc="碰撞 / 雷击 / 湍流 / 中弹 / 爆炸" v={st.shake} on={(v) => st.set({ shake: v })} />
            <Toggle label="鼠标左键开火" desc="装备机炮后按住左键射击（同时环视瞄准）；关闭后只用 C 键" v={st.mouseFire} on={(v) => st.set({ mouseFire: v })} />
            <h4>存档</h4>
            <div className="set-btns">
              <button className="small" onClick={() => st.set(DEFAULT_SETTINGS)}>恢复默认设置</button>
              <button className="small danger" disabled={!started} onClick={() => setConfirm('save')}>清除存档…</button>
              <button className="small danger" onClick={() => setConfirm('achv')}>清除成就…</button>
            </div>
            {confirm && (
              <div className="confirm">
                <span>{confirm === 'save' ? '将删除当前航程存档（银币、声望、货舱、改装、主线进度），成就不受影响。确定吗？' : '将清空全部成就与累计记录，存档不受影响。确定吗？'}</span>
                <div><button className="small primary" onClick={confirm === 'save' ? wipeSave : wipeAchv}>确定清除</button><button className="small" onClick={() => setConfirm(null)}>取消</button></div>
              </div>
            )}
          </section>
        </div>
        <div className="sheet-foot"><small>声音在第一次点击或按键后启用。画质「流畅」适合集成显卡。</small><button className="primary" onClick={close}>关闭（Esc）</button></div>
      </div>
    </div>
  )
}
