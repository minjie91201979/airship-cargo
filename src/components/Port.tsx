import { useEffect, useState } from 'react'
import { ship } from '../game/flight'
import { FUEL } from '../game/fuel'
import { MISSION_NAMES, COAL_PRICE, KIND_DESC, KIND_NAMES, LIVERIES, REPAIR_PRICE, WATER_PRICE, buyFuel, cargoWeight, islandName, liveryState, rt, useEco, type Cargo, type Contract, type Kind } from '../game/economy'
import { MAX_LEVEL, PARTS, PART_IDS, SHOP_DISCOUNT, hasShop, partCost, partReq, partStats, shipMods, type Part } from '../game/upgrades'
import { COLD_KIT_COST, HULLS, HULL_IDS, LARGE_PORTS_TEXT, hasYard, hullHpMax, hullOf, hullSlots, hullWeight, type HullId } from '../game/hulls'
import { useGame, type PortTab } from '../game/store'
import { ISLANDS, MAIN_ISLANDS, FROST_ISLANDS, regionOfIsland } from '../game/world'
import { StoryBox } from './Story'
import { FLARE_PRICE, WEAPONS, WEAPON_IDS, WEAPON_MAX, flareMax, hasArms, weaponCost, weaponReq, weaponStats, type WeaponId } from '../game/weapons'

export const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} 千米` : `${Math.round(m)} 米`)
export const Coin = ({ v }: { v: number }) => <span className="coin"><i>◉</i>{Math.round(v).toLocaleString('zh-CN')}</span>
export const KindTag = ({ k }: { k: Kind }) => <span className={`kind k-${k}`} title={KIND_DESC[k]}>{KIND_NAMES[k]}</span>

const TABS: [PortTab, string][] = [['board', '委托'], ['hold', '货舱'], ['supply', '补给'], ['shop', '改装'], ['yard', '船坞']]
const ISLAND_DESC = (id: string) => ISLANDS.find((i) => i.id === id)?.desc ?? ''

function Board({ island }: { island: string }) {
  const list = useEco((s) => s.boards[island] ?? [])
  const cargo = useEco((s) => s.cargo)
  const slots = useEco((s) => s.slots)
  const maxW = useEco((s) => s.maxWeight)
  const accept = useEco((s) => s.accept)
  const note = useEco((s) => s.note)
  const used = cargoWeight(cargo)
  const weapons = useEco((s) => s.weapons)
  const mission = useEco((s) => s.mission)
  const reason = (c: Contract) => c.mission ? (!hasArms(weapons) ? '需要武器' : mission ? '已有战斗委托' : null) : (cargo.length >= slots ? '货位已满' : used + c.weight > maxW + 1e-6 ? '超重' : null)
  const left = Math.max(0, 300 - (rt.clock - (useEco.getState().boardAt[island] ?? rt.clock)))
  const shipBig = useEco((s) => s.hull) === 'giant'
  const bigOk = (id: string) => !!ISLANDS.find((i) => i.id === id)?.large
  return (
    <div className="board">
      <div className="board-head">
        <span>{islandName(island)}委托公告板 · {ISLAND_DESC(island)}</span>
        <small>约 {fmtTime(left)} 后刷新 · 交付后补充新委托</small>
      </div>
      <StoryBox island={island} />
      {list.length === 0 && <div className="empty">暂时没有委托，稍后再来看看。</div>}
      {list.map((c) => {
        const r = reason(c)
        if (c.mission) return (
          <div key={c.id} className={`contract mission m-${c.mission}`}>
            <div className="c-main">
              <div className="c-title"><span className={`mission-tag m-${c.mission}`}>{c.mission === 'escort' ? '🛡 ' : c.mission === 'bounty' ? '☠ ' : '🏴 '}{MISSION_NAMES[c.mission]}</span><b>{c.goods}</b>{c.mission === 'escort' && <><span className="arrow">→</span><b className="dest">{islandName(c.to)}</b></>}</div>
              <div className="c-meta">
                {c.mission === 'escort' && <><span>航程 <b>{fmtDist(c.dist)}</b></span><span>商船航速 <b>约 18 节</b></span><span>途中 <b className="hot">{c.dist > 1500 ? 3 : 2} 波</b>空贼袭击</span></>}
                {c.mission === 'bounty' && <><span>搜索区域距此 <b>{fmtDist(c.dist)}</b></span><span>目标 <b className="hot">通缉空贼 + 小艇护卫</b></span></>}
                {c.mission === 'boss' && <><span>黑帆锚地距此 <b>{fmtDist(c.dist)}</b></span><span>目标 <b className="hot">黑帆号（首领战 · 三阶段）</b></span></>}
              </div>
              <small className="c-desc">{c.mission === 'escort' ? '起航后商船跟随航线飞往目的地；击退来袭空贼，报酬按商船抵达时的完好度结算（30%~100%）。不占货位。' : c.mission === 'bounty' ? '前往小地图上的红色搜索区域，击落通缉空贼领取赏金。不占货位，可同时运货。' : '特别篇「黑帆落幕」：击沉黑鸦的旗舰。奖励 3000 银币、独占涂装「黑帆缴获」与成就。建议机炮 Lv2、装甲 Lv2 以上，带足照明弹。'}{r === '需要武器' ? ' · 需要先在云港 / 工坊城「改装」页购买机炮或鱼叉' : ''}</small>
            </div>
            <div className="c-side">
              <Coin v={c.reward} />{c.mission === 'escort' && <small className="soft">满额</small>}
              <button className={r ? '' : 'primary small'} disabled={!!r} onClick={() => { const e = accept(island, c.id); if (e) note(e, true) }}>{r ?? '接受委托'}</button>
            </div>
          </div>
        )
        return (
          <div key={c.id} className={`contract k-${c.kind} ${c.story ? 'story' : ''} ${c.long ? 'long' : ''} ${c.melt ? 'melt' : ''}`}>
            <div className="c-main">
              <div className="c-title">{c.story && <span className="story-tag">{c.story.startsWith('f') ? '霜原篇' : '主线'}</span>}{c.long && <span className="long-tag">跨区长途</span>}{c.melt && <span className="melt-tag">🧊 冰鲜</span>}<KindTag k={c.kind} /><b>{c.goods}</b><span className="arrow">→</span><b className="dest">{islandName(c.to)}</b></div>
              <div className="c-meta">
                <span>距离 <b>{fmtDist(c.dist)}</b></span>
                <span>重量 <b>{c.weight.toFixed(1)} 吨</b></span>
                <span>{c.kind === 'urgent' ? <>限时 <b className="hot">{fmtTime(c.limit)}</b></> : <>期望 <b>{fmtTime(c.limit)}</b> 内送达有奖励</>}</span>
              </div>
              <small className="c-desc">{c.story ? `主线委托 · ${c.melt ? '冰块会融化，按剩余量结算' : KIND_DESC[c.kind]}${c.minCond ? ` · 要求${c.melt ? '剩余量' : '完好度'} ≥${Math.round(c.minCond * 100)}%` : ''}` : c.melt ? '冰块会融化：霜原几乎不化，云港群岛白天化得快、夜里慢；按送达时的剩余量结算' : KIND_DESC[c.kind]}{c.long ? ` · 需飞越强风墙（升限 500 米 + 高度 440 米以上）· 送达额外声望 +2` : ''}{shipBig && !bigOk(c.to) ? ` · ⚠ 巨型运输舰无法停靠${islandName(c.to)}` : ''}</small>
            </div>
            <div className="c-side">
              <Coin v={c.reward} />
              <button className={r ? '' : 'primary small'} disabled={!!r} onClick={() => { const e = accept(island, c.id); note(e ?? `已接单：${c.goods} → ${islandName(c.to)}`, !!e) }}>{r ?? '接单'}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CargoRow({ c, compact }: { c: Cargo; compact?: boolean }) {
  const used = rt.clock - c.acceptedAt
  const t = c.limit - used
  const timer = c.kind === 'urgent'
    ? (t >= 0 ? <b className={t < 30 ? 'hot' : ''}>剩 {fmtTime(t)}</b> : <b className="late">超时 {fmtTime(-t)}</b>)
    : (t >= 0 ? <span className="soft">奖励 {fmtTime(t)}</span> : <span className="soft">已过奖励期</span>)
  return (
    <div className={`cargo-row k-${c.kind} ${compact ? 'compact' : ''} ${c.story ? 'story' : ''}`}>
      {c.story && <span className="story-tag">主线</span>}
      <KindTag k={c.kind} />
      <span className="g">{c.goods}</span>
      <span className="d">→ {islandName(c.to)}</span>
      {timer}
      {c.melt ? <span className={`cond melt ${c.condition < 0.6 ? 'bad' : ''}`}>🧊 剩余 {Math.round(c.condition * 100)}%</span>
        : c.kind === 'fragile' && <span className={`cond ${c.condition < 0.6 ? 'bad' : ''}`}>完好 {Math.round(c.condition * 100)}%</span>}
      {!compact && <span className="w">{c.weight.toFixed(1)} 吨</span>}
    </div>
  )
}

function Hold() {
  const cargo = useEco((s) => s.cargo)
  const slots = useEco((s) => s.slots)
  const maxW = useEco((s) => s.maxWeight)
  const stats = useEco((s) => s.stats)
  const rep = useEco((s) => s.rep)
  const abandon = useEco((s) => s.abandon)
  const used = cargoWeight(cargo)
  const [, force] = useState(0)
  useEffect(() => { const id = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(id) }, [])
  return (
    <div className="hold">
      <div className="cap">
        <div><small>货位</small><div className="bar"><i style={{ width: `${(cargo.length / slots) * 100}%` }} /></div><b>{cargo.length} / {slots}</b></div>
        <div><small>载重</small><div className="bar"><i style={{ width: `${Math.min(1, used / maxW) * 100}%` }} /></div><b>{used.toFixed(1)} / {maxW} 吨</b></div>
      </div>
      <MissionRow />
      {cargo.length === 0 && <div className="empty">货舱空空如也。去「委托」标签接单吧。</div>}
      {cargo.map((c) => (
        <div key={c.id} className="hold-item">
          <CargoRow c={c} />
          <button className="small" onClick={() => abandon(c.id)}>放弃</button>
        </div>
      ))}
      <div className="stats">
        <span>累计交付 <b>{stats.deliveries}</b> 单</span>
        <span>失败 <b>{stats.failed}</b> 单</span>
        <span>航程 <b>{fmtDist(stats.distance)}</b></span>
        <span>总收入 <Coin v={stats.earnings} /></span>
        <span>总支出 <Coin v={stats.spent} /></span>
      </div>
      <div className="reps">
        {MAIN_ISLANDS.map((i) => <span key={i.id}>{i.name} <b>{rep[i.id] ?? 0}</b></span>)}
      </div>
      <div className="reps frost">
        <em>霜原</em>{FROST_ISLANDS.map((i) => <span key={i.id}>{i.name} <b>{rep[i.id] ?? 0}</b></span>)}
      </div>
      <small className="soft">声望越高，该岛委托报酬越高（每点 +0.5%）。载重越大，需要越高的锅炉压力维持中性浮力，加速与转向更迟缓，耗煤略增。</small>
    </div>
  )
}

function MissionRow() {
  const m = useEco((s) => s.mission)
  const abandon = useEco((s) => s.abandonMission)
  const [sure, setSure] = useState(false)
  if (!m) return null
  return (
    <div className={`hold-item mission-row m-${m.mission}`}>
      <div className="cargo-row"><span className={`mission-tag m-${m.mission}`}>{MISSION_NAMES[m.mission!]}</span><span className="g">{m.goods}</span>{m.mission === 'escort' && <span className="d">→ {islandName(m.to)} · 商船完好 {m.npcHp}%</span>}<span className="soft">报酬 {m.reward}</span></div>
      {!sure ? <button className="small" onClick={() => setSure(true)}>放弃</button> : <button className="small primary" onClick={() => { abandon(); setSure(false) }}>确认放弃{m.mission !== 'boss' ? '（声望 -2）' : ''}</button>}
    </div>
  )
}

function ArmsSupply({ island }: { island: string }) {
  const weapons = useEco((s) => s.weapons)
  const flares = useEco((s) => s.flares)
  const holes = useEco((s) => s.holes)
  const buyFlares = useEco((s) => s.buyFlares)
  const patch = useEco((s) => s.patchHoles)
  const note = useEco((s) => s.note)
  const max = flareMax(weapons)
  const hp = Math.round(35 * (REPAIR_PRICE[island] ?? 1.5))
  return (
    <>
      {max > 0 && (
        <div className="sup-row flare">
          <b>照明弹</b>
          <div className="bar"><i style={{ width: `${(flares / max) * 100}%` }} /></div>
          <span>{flares}/{max}</span>
          <span className="price">{FLARE_PRICE} 银币 / 发</span>
          <button className="small primary" disabled={flares >= max} onClick={() => { const e = buyFlares(island); if (e) note(e, true) }}>补满（{(max - flares) * FLARE_PRICE}）</button>
        </div>
      )}
      <div className="sup-row leak">
        <b>气囊</b>
        <div className="bar"><i style={{ width: `${Math.max(0, 1 - holes / 6) * 100}%` }} /></div>
        <span>{holes ? `破洞 ${holes}` : '完好'}</span>
        <span className="price">{hp} 银币 / 处{island === 'workshop' ? <em>工坊优惠</em> : null}</span>
        <button className="small primary" disabled={!holes} onClick={() => { const e = patch(island); if (e) note(e, true) }}>修补（{holes * hp}）</button>
      </div>
    </>
  )
}

function Supply({ island }: { island: string }) {
  const money = useEco((s) => s.money)
  const note = useEco((s) => s.note)
  const pay = useEco((s) => s.pay)
  const [, force] = useState(0)
  const cp = COAL_PRICE[island] ?? 1, wp = WATER_PRICE[island] ?? 1
  const buy = (k: 'coal' | 'water') => {
    const cur = k === 'coal' ? ship.coal : ship.water
    const { amount, cost } = buyFuel(island, k, cur)
    if (amount <= 0) { note(cur >= 0.99 ? '已经满舱' : '银币不足', cur < 0.999); return }
    if (k === 'coal') ship.coal = Math.min(1, cur + amount)
    else ship.water = Math.min(1, cur + amount)
    useEco.getState().sync(ship.coal, ship.water)
    note(`购入${k === 'coal' ? '燃煤' : '锅炉用水'} ${Math.round(amount * 100)}%，花费 ${cost} 银币`)
    force((x) => x + 1)
  }
  const needCoal = (1 - ship.coal) * 100 * cp, needWater = (1 - ship.water) * 100 * wp
  // 港务救济：身无分文且燃料见底时免费补到 60%（v1.1 由 25% 提高），避免卡死
  const relief = money < 20 * cp && (ship.coal < 0.25 || ship.water < 0.25)
  const row = (label: string, k: 'coal' | 'water', v: number, price: number, need: number) => (
    
    <div className={`sup-row ${k}`}>
      <b>{label}</b>
      <div className="bar"><i style={{ width: `${v * 100}%` }} /></div>
      <span>{Math.round(v * 100)}%</span>
      <span className="price">{price.toFixed(2)} 银币 / 1%{(k === 'coal' ? island === 'coal' : island === 'spring') ? <em>本岛特价</em> : null}</span>
      <button className="small primary" disabled={v >= 0.99} onClick={() => buy(k)}>补满（{Math.ceil(need)}）</button>
    </div>
  )
  void pay
  return (
    <div className="supply">
      {row('燃煤', 'coal', ship.coal, cp, needCoal)}
      {row('用水', 'water', ship.water, wp, needWater)}
      {regionOfIsland(island) === 'frost' && <small className="soft">❄ 霜原寒冷：锅炉耗煤 +35%（装了防寒锅炉罩只 +8%）。霜原煤贵水便宜，温泉谷的水几乎白送。</small>}
      <small className="soft">煤价：煤矿岛最便宜；水价：清泉岛最便宜。银币不足时会买到力所能及的量。满舱约够巡航 6~7 分钟（载货越重耗煤越多）。</small>
      {relief && (
        <div className="relief">
          <span>港务局见你囊中羞涩，愿意提供一次免费救济燃料（补到 60%，够飞到邻近岛屿）。</span>
          <button className="small" onClick={() => {
            ship.coal = Math.max(ship.coal, 0.6); ship.water = Math.max(ship.water, 0.6)
            useEco.getState().sync(ship.coal, ship.water); note('港务救济：煤水已补到 60%'); force((x) => x + 1)
          }}>接受救济</button>
        </div>
      )}
      {ship.coal < FUEL.low && !relief && <small className="hot">燃煤偏低，建议起航前补给。</small>}
      <Repair island={island} />
      <ArmsSupply island={island} />
      {!hasShop(island) && <div className="shop-note">⚙ 本岛没有改装工坊。升级飞艇与更换涂装请前往 <b>云港</b>、<b>工坊城</b>（85 折）或霜原的 <b>冰港</b>；换船体去这三处的「船坞」。</div>}
    </div>
  )
}

function Repair({ island }: { island: string }) {
  const hp = useEco((s) => s.hp)
  const armor = useEco((s) => s.parts.armor)
  const hull = useEco((s) => s.hull)
  const repair = useEco((s) => s.repair)
  const note = useEco((s) => s.note)
  const max = hullHpMax(hull, armor)
  const price = REPAIR_PRICE[island] ?? 1.5
  return (
    <div className="sup-row hull">
      <b>船体</b>
      <div className="bar"><i style={{ width: `${(hp / max) * 100}%` }} /></div>
      <span>{Math.round(hp)}/{max}</span>
      <span className="price">{price.toFixed(2)} 银币 / 点{island === 'workshop' ? <em>工坊优惠</em> : null}</span>
      <button className="small primary" disabled={hp >= max - 0.5} onClick={() => { const e = repair(island); if (e) note(e, true) }}>修理（{Math.ceil((max - hp) * price)}）</button>
    </div>
  )
}

function PartCard({ part, island }: { part: Part; island: string }) {
  const lv = useEco((s) => s.parts[part])
  const money = useEco((s) => s.money)
  const rep = useEco((s) => s.rep)
  const buy = useEco((s) => s.buyPart)
  const note = useEco((s) => s.note)
  const P = PARTS[part]
  const max = lv >= MAX_LEVEL
  const cur = partStats(part, lv), nxt = max ? null : partStats(part, lv + 1)
  const cost = partCost(part, lv, island)
  const req = partReq(part, lv)
  const reqOk = !req || (rep[req.island] ?? 0) >= req.rep
  const err = max ? '已满级' : !reqOk ? '声望不足' : money < cost ? '银币不足' : null
  return (
    <div className={`part ${max ? 'max' : ''}`}>
      <div className="p-head">
        <i>{P.icon}</i><b>{P.name}</b>
        <span className="lv">{Array.from({ length: MAX_LEVEL }, (_, i) => <s key={i} className={i < lv ? 'on' : ''} />)}</span>
        <small>Lv{lv}</small>
      </div>
      <div className="p-stats">
        {cur.map(([k, v], i) => (
          <div key={k}><span>{k}</span><b>{v}</b>{nxt && <><em>→</em><b className={nxt[i][1] !== v ? 'up' : ''}>{nxt[i][1]}</b></>}</div>
        ))}
      </div>
      <div className="p-foot">
        {max ? <span className="soft">「{P.lvNames[lv - 1]}」已达最高等级</span> : <>
          <span className="p-next">「{P.lvNames[lv - 1]}」→「{P.lvNames[lv]}」{req && <em className={reqOk ? 'ok' : 'bad'}>需{islandName(req.island)}声望 {req.rep}（{rep[req.island] ?? 0}）</em>}</span>
          <button className={err ? 'small' : 'small primary'} disabled={!!err} onClick={() => { const e = buy(part, island); if (e) note(e, true) }}>{err ?? <>升级 <Coin v={cost} /></>}</button>
        </>}
      </div>
    </div>
  )
}

function WeaponCard({ w, island }: { w: WeaponId; island: string }) {
  const lv = useEco((s) => s.weapons?.[w] ?? 0)
  const money = useEco((s) => s.money)
  const rep = useEco((s) => s.rep)
  const buy = useEco((s) => s.buyWeapon)
  const note = useEco((s) => s.note)
  const W = WEAPONS[w]
  const max = lv >= WEAPON_MAX
  const cur = lv ? weaponStats(w, lv) : null, nxt = max ? null : weaponStats(w, lv + 1)
  const cost = weaponCost(w, lv, island)
  const req = weaponReq(w, lv)
  const reqOk = !req || (rep[req.island] ?? 0) >= req.rep
  const err = max ? '已满级' : !reqOk ? '声望不足' : money < cost ? '银币不足' : null
  return (
    <div className={`part weapon ${max ? 'max' : ''} ${lv ? '' : 'unowned'}`}>
      <div className="p-head">
        <i>{W.icon}</i><b>{W.name}</b>
        <span className="lv">{Array.from({ length: WEAPON_MAX }, (_, i) => <s key={i} className={i < lv ? 'on' : ''} />)}</span>
        <small>{lv ? `Lv${lv}` : '未装备'}</small>
      </div>
      <small className="w-desc">{W.desc} · 键位 <kbd>{W.key}</kbd> / <kbd>{W.pad}</kbd></small>
      <div className="p-stats">
        {(nxt ?? cur ?? []).map(([k, v], i) => (
          <div key={k}><span>{k}</span>{cur ? <b>{cur[i][1]}</b> : <b className="soft">—</b>}{nxt && <><em>→</em><b className={!cur || nxt[i][1] !== cur[i][1] ? 'up' : ''}>{v}</b></>}</div>
        ))}
      </div>
      <div className="p-foot">
        {max ? <span className="soft">「{W.lvNames[lv - 1]}」已达最高等级</span> : <>
          <span className="p-next">{lv ? `「${W.lvNames[lv - 1]}」→` : '购入'}「{W.lvNames[lv]}」{req && <em className={reqOk ? 'ok' : 'bad'}>需{islandName(req.island)}声望 {req.rep}（{rep[req.island] ?? 0}）</em>}</span>
          <button className={err ? 'small' : 'small primary'} disabled={!!err} onClick={() => { const e = buy(w, island); if (e) note(e, true) }}>{err ?? <>{lv ? '升级' : '购买'} <Coin v={cost} /></>}</button>
        </>}
      </div>
    </div>
  )
}

function Liveries() {
  const st = useEco()
  const sel = st.previewLivery ?? st.livery
  const l = LIVERIES.find((x) => x.id === sel) ?? LIVERIES[0]
  const ls = liveryState(l, st)
  return (
    <div className="liveries">
      <div className="lv-head"><b>涂装</b><small>点击色板即可在右侧飞艇上实时预览</small></div>
      <div className="lv-row">
        {LIVERIES.map((x) => {
          const xs = liveryState(x, st)
          return (
            <button key={x.id} className={`swatch ${x.id === sel ? 'sel' : ''} ${x.id === st.livery ? 'cur' : ''} ${xs.ok ? '' : 'locked'}`} onClick={() => st.setPreview(x.id === st.livery ? null : x.id)} title={x.desc}>
              <span className="sw" style={{ background: `linear-gradient(90deg, ${x.canvas} 0 50%, ${x.canvas2} 50% 75%, ${x.fin} 75%)` }} />
              <small>{x.name}</small>
              {!xs.ok && <i>🔒</i>}
            </button>
          )
        })}
      </div>
      <div className="lv-info">
        <span><b>{l.name}</b> · {l.desc} · <em>{l.id === st.livery ? '使用中' : ls.text}</em></span>
        {l.id !== st.livery && <button className="small primary" disabled={!ls.ok || (l.unlock.type === 'buy' && !ls.owned && st.money < l.unlock.cost)} onClick={() => { const e = st.useLivery(l.id); if (e) st.note(e, true) }}>{ls.owned || l.unlock.type !== 'buy' ? '换上' : `购买并换上（${l.unlock.cost}）`}</button>}
      </div>
    </div>
  )
}

function Shop({ island }: { island: string }) {
  const d = SHOP_DISCOUNT[island] ?? 1
  return (
    <div className="shop">
      <div className="board-head"><span>{islandName(island)}改装工坊{d < 1 ? ` · 全场 ${Math.round(d * 100) / 10} 折` : ''}</span><small>高级改装需要相应岛屿的声望</small></div>
      <div className="parts">{PART_IDS.map((p) => <PartCard key={p} part={p} island={island} />)}</div>
      <div className="lv-head arms-head"><b>⚔ 武器槽</b><small>武器不是主线必需品——不想战斗也可以继续靠甩、躲、抛货避开空贼。照明弹在任意港口「补给」页补充。</small></div>
      <div className="parts arms">{WEAPON_IDS.map((w) => <WeaponCard key={w} w={w} island={island} />)}</div>
      <ColdKitCard island={island} />
      <Liveries />
    </div>
  )
}

function ColdKitCard({ island }: { island: string }) {
  const kit = useEco((s) => s.coldKit)
  const money = useEco((s) => s.money)
  const buy = useEco((s) => s.buyColdKit)
  const note = useEco((s) => s.note)
  return (
    <div className={`part coldkit ${kit ? 'max' : ''}`}>
      <div className="p-head"><i>❄</i><b>防寒锅炉罩</b><small>{kit ? '已安装' : '未安装'}</small></div>
      <small className="w-desc">毡布 + 铜皮的锅炉保温罩。霜原群岛的寒风会让锅炉多吃煤：未安装 +35%，安装后只 +8%。三种船体通用。</small>
      <div className="p-foot">
        {kit ? <span className="soft">锅炉裹得严严实实</span> : <button className={money < COLD_KIT_COST ? 'small' : 'small primary'} disabled={money < COLD_KIT_COST} onClick={() => { const e = buy(island); if (e) note(e, true) }}>{money < COLD_KIT_COST ? '银币不足' : <>安装 <Coin v={COLD_KIT_COST} /></>}</button>}
      </div>
    </div>
  )
}

/** v1.3 船坞：三种船体（改装等级共享，船体只提供基础倍率） */
function Yard({ island }: { island: string }) {
  const st = useEco()
  const sel = st.previewHull ?? st.hull
  const used = cargoWeight(st.cargo)
  const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`
  return (
    <div className="yard">
      <div className="board-head"><span>{islandName(island)}船坞 · 购买一次，随时在船坞换乘</span><small>改装等级（锅炉 / 螺旋桨 / 气囊 / 货舱 / 装甲）三种船体通用</small></div>
      <div className="hulls">
        {HULL_IDS.map((id: HullId) => {
          const H = HULLS[id]
          const owned = st.hulls.includes(id)
          const cur = st.hull === id
          const m = shipMods(st.parts, hullOf(id))
          const slots = hullSlots(id, st.parts.hold), w = hullWeight(id, st.parts.hold)
          const block = !cur && owned ? (st.cargo.length > slots ? `货物 ${st.cargo.length} 件超出货位` : used > w + 1e-6 ? '货物超出载重' : null) : null
          return (
            <div key={id} className={`hull-card ${cur ? 'cur' : ''} ${sel === id ? 'sel' : ''}`} onClick={() => st.setPreviewHull(id === st.hull ? null : id)}>
              <div className="h-head"><i>{H.icon}</i><b>{H.name}</b><small>{cur ? '使用中' : owned ? '已拥有' : H.cost ? `${H.cost} 银币` : ''}</small></div>
              <small className="h-desc">{H.desc}</small>
              <div className="h-stats">
                <div><span>货位</span><b>{slots}</b></div>
                <div><span>载重</span><b>{w} 吨</b></div>
                <div><span>耐久</span><b>{hullHpMax(id, st.parts.armor)}</b></div>
                <div><span>推力</span><b className={H.thrust > 1 ? 'up' : H.thrust < 1 ? 'down' : ''}>{pct(H.thrust)}</b></div>
                <div><span>转向</span><b className={H.turn > 1 ? 'up' : H.turn < 1 ? 'down' : ''}>{pct(H.turn)}</b></div>
                <div><span>耗煤</span><b className={H.coal < 1 ? 'up' : H.coal > 1 ? 'down' : ''}>{pct(H.coal)}</b></div>
                <div><span>升限</span><b className={H.ceiling > 0 ? 'up' : H.ceiling < 0 ? 'down' : ''}>{m.ceiling} 米</b></div>
                <div><span>停靠</span><b className={H.bigOnly ? 'down' : ''}>{H.bigOnly ? '仅大港' : '全部'}</b></div>
              </div>
              {H.bigOnly && <small className="h-warn">只能停靠：{LARGE_PORTS_TEXT}</small>}
              <div className="h-foot" onClick={(ev) => ev.stopPropagation()}>
                {cur ? <span className="soft">✔ 正在驾驶</span>
                  : owned ? <button className={block ? 'small' : 'small primary'} disabled={!!block} onClick={() => { const e = st.switchHull(id, island); if (e) st.note(e, true) }}>{block ?? '换乘'}</button>
                    : <button className={st.money < H.cost ? 'small' : 'small primary'} disabled={st.money < H.cost} onClick={() => { const e = st.buyHull(id, island); if (e) st.note(e, true) }}>{st.money < H.cost ? '银币不足' : <>购买并换乘 <Coin v={H.cost} /></>}</button>}
              </div>
            </div>
          )
        })}
      </div>
      <small className="soft">点击船体卡片可在右侧预览外形。换乘时耐久按比例换算；货舱里的货物必须装得下新船体。涂装三种船体通用。</small>
    </div>
  )
}

export function PortPanel() {
  const tab = useGame((s) => s.portTab)
  const setTab = useGame((s) => s.setPortTab)
  const close = useGame((s) => s.closePort)
  const money = useEco((s) => s.money)
  const cargo = useEco((s) => s.cargo)
  const rep = useEco((s) => s.rep)
  const island = ship.dock.island.id
  const shop = hasShop(island)
  const yard = hasYard(island)
  useEffect(() => { useEco.getState().board(island) }, [island])
  useEffect(() => { if ((tab === 'shop' && !shop) || (tab === 'yard' && !yard)) setTab('board') }, [tab, shop, yard, setTab])
  useEffect(() => () => { useEco.getState().setPreview(null); useEco.getState().setPreviewHull(null) }, [])
  useEffect(() => { if (tab !== 'shop') useEco.getState().setPreview(null); if (tab !== 'yard') useEco.getState().setPreviewHull(null) }, [tab])
  return (
    <div className={`overlay port ${tab === 'shop' || tab === 'yard' ? 'shop-mode' : ''}`}>
      <div className="panel brass port-panel">
        <div className="port-top">
          <div>
            <small>— 港口 —</small>
            <h2>{islandName(island)}</h2>
          </div>
          <div className="port-info">
            <span>银币 <Coin v={money} /></span>
            <span>本岛声望 <b>{rep[island] ?? 0}</b></span>
            <span>货舱 <b>{cargo.length}</b> 件 · <b>{cargoWeight(cargo).toFixed(1)}</b> 吨</span>
          </div>
        </div>
        <div className="tabs">
          {TABS.filter(([k]) => (k !== 'shop' || shop) && (k !== 'yard' || yard)).map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}{k === 'hold' && cargo.length ? ` (${cargo.length})` : ''}</button>)}
        </div>
        <div className="tab-body">
          {tab === 'board' && <Board island={island} />}
          {tab === 'hold' && <Hold />}
          {tab === 'supply' && <Supply island={island} />}
          {tab === 'shop' && shop && <Shop island={island} />}
          {tab === 'yard' && yard && <Yard island={island} />}
        </div>
        <div className="port-foot">
          <small>港口面板打开时时间暂停；系泊时锅炉压火，几乎不耗煤。</small>
          <button className="primary" onClick={close}>起航（Esc）</button>
        </div>
      </div>
    </div>
  )
}

export function SettlementCard() {
  const st = useEco((s) => s.settlement)
  const closeS = useEco((s) => s.closeSettlement)
  if (!st) return null
  return (
    <div className="overlay settle-wrap">
      <div className="panel brass settle">
        <small>— 货物交付结算 —</small>
        <h2>{islandName(st.island)}</h2>
        <table>
          <thead><tr><th>货物</th><th>基础报酬</th><th>速度奖励</th><th>损坏扣款</th><th>超时扣款</th><th>声望</th><th>小计</th></tr></thead>
          <tbody>
            {st.rows.map((r, i) => (
              <tr key={i}>
                <td><KindTag k={r.kind} /> {r.goods}<small>来自{islandName(r.from)} · {r.note}</small></td>
                <td>{r.base}</td>
                <td className="pos">{r.bonus ? `+${r.bonus}` : '—'}</td>
                <td className="neg">{r.damage ? `-${r.damage}` : '—'}</td>
                <td className="neg">{r.late ? `-${r.late}` : '—'}</td>
                <td className="pos">+{r.rep}</td>
                <td><b>{r.total}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="settle-total">合计 <Coin v={st.total} /></div>
        <button className="primary" onClick={closeS}>收下银币</button>
      </div>
    </div>
  )
}
