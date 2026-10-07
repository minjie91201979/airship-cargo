import { useEffect } from 'react'
import { useEco } from '../game/economy'
import { useGame } from '../game/store'
import { CHAPTERS, CHARS, CN_NUM, CREDITS, FCHAPTERS, chapterCard, creditsCard, currentChapter, currentFrost, endingCard, frostChapterCard, frostEndCard, frostUnlockCard, introCard, objDetail, objDone, progText, pushCard, useStory, type CharId } from '../game/story'
import { ACHVS, achvProgText, useAchv } from '../game/achv'
import { useFanfare } from '../game/fanfare'
import { keyCodeOf } from '../game/input'
import { Coin, fmtDist } from './Port'

/** 角色徽章头像（SVG） */
export function Portrait({ who, size = 64 }: { who: CharId; size?: number }) {
  const bg: Record<CharId, [string, string]> = {
    captain: ['#2d4a70', '#162740'], keeper: ['#3f6b48', '#1f3a26'], smith: ['#8a4a26', '#4a2412'],
    light: ['#27406e', '#0e1a33'], crow: ['#2a2228', '#0c090b'], narrator: ['#6b5a3a', '#3a2e1c'],
    birch: ['#5a7f9a', '#22384a'], beichen: ['#2a2f6a', '#0b0c2a'], aya: ['#7a4a5e', '#3a1e2c'],
  }
  const [a, b] = bg[who]
  const id = `pg-${who}`
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 100 100">
      <defs>
        <radialGradient id={id} cx="50%" cy="40%" r="65%"><stop offset="0%" stopColor={a} /><stop offset="100%" stopColor={b} /></radialGradient>
        <linearGradient id="pring" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f2cf7c" /><stop offset="50%" stopColor="#a86b2c" /><stop offset="100%" stopColor="#e8b45e" /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill="url(#pring)" />
      <circle cx="50" cy="50" r="43" fill={`url(#${id})`} stroke="#3b2412" strokeWidth="1.5" />
      {who === 'captain' && <g>
        <circle cx="50" cy="56" r="17" fill="#e9c9a0" />
        <path d="M33 60 Q50 92 67 60 Q60 70 50 70 Q40 70 33 60Z" fill="#f2f2ee" />
        <path d="M28 44 L72 44 L68 38 L32 38Z" fill="#1c1c22" />
        <path d="M34 38 Q50 18 66 38Z" fill="#f4f1ea" stroke="#1c1c22" strokeWidth="1.5" />
        <circle cx="50" cy="32" r="4" fill="#e0b25a" />
        <circle cx="44" cy="54" r="2" fill="#2a1a10" /><circle cx="56" cy="54" r="2" fill="#2a1a10" />
        <path d="M62 66 L76 66 L76 70 L66 70Z" fill="#6b4528" />
      </g>}
      {who === 'keeper' && <g>
        <circle cx="50" cy="54" r="18" fill="#efcfa6" />
        <path d="M30 46 Q50 26 70 46 Q60 38 50 38 Q40 38 30 46Z" fill="#3a2a1e" />
        <circle cx="43" cy="53" r="5.5" fill="none" stroke="#e0b25a" strokeWidth="2" /><circle cx="57" cy="53" r="5.5" fill="none" stroke="#e0b25a" strokeWidth="2" />
        <line x1="48.5" y1="53" x2="51.5" y2="53" stroke="#e0b25a" strokeWidth="2" />
        <path d="M42 64 Q50 68 58 64" stroke="#5a3418" strokeWidth="2" fill="none" />
        <circle cx="72" cy="74" r="10" fill="#e8b45e" stroke="#7a4a1a" strokeWidth="2" /><text x="72" y="78" textAnchor="middle" fontSize="11" fill="#7a4a1a" fontWeight="900">银</text>
      </g>}
      {who === 'smith' && <g>
        <g transform="translate(50 52)">
          {Array.from({ length: 8 }, (_, i) => <rect key={i} x="-4" y="-27" width="8" height="10" fill="#c98a3e" transform={`rotate(${i * 45})`} />)}
          <circle r="20" fill="#c98a3e" /><circle r="8" fill="#4a2412" />
        </g>
        <g transform="rotate(-35 50 50)"><rect x="47" y="30" width="6" height="40" fill="#6b4528" /><rect x="38" y="24" width="24" height="11" rx="2" fill="#4a4a52" /></g>
      </g>}
      {who === 'light' && <g>
        <path d="M50 40 L95 22 L95 50Z" fill="#fff2b0" opacity="0.35" />
        <path d="M50 40 L5 22 L5 50Z" fill="#fff2b0" opacity="0.2" />
        <path d="M42 84 L45 46 L55 46 L58 84Z" fill="#f2ede2" />
        <rect x="44" y="56" width="12" height="5" fill="#b8322a" /><rect x="43.5" y="70" width="13" height="5" fill="#b8322a" />
        <rect x="43" y="36" width="14" height="10" fill="#ffe08a" stroke="#3b2412" strokeWidth="1.2" />
        <path d="M41 36 L50 28 L59 36Z" fill="#b8322a" />
      </g>}
      {who === 'crow' && <g>
        <path d="M22 62 Q30 40 52 38 Q66 36 76 30 Q70 44 72 50 L84 52 L72 56 Q66 70 48 72 Q34 74 22 62Z" fill="#141016" stroke="#6a1a16" strokeWidth="1.5" />
        <circle cx="64" cy="46" r="3" fill="#ff3a2a" />
        <path d="M30 80 L70 80" stroke="#8a1f1a" strokeWidth="3" />
        <path d="M40 76 L60 84 M60 76 L40 84" stroke="#d8d0c0" strokeWidth="2.5" />
      </g>}
      {who === 'birch' && <g>
        <circle cx="50" cy="56" r="17" fill="#f0d6b8" />
        <path d="M30 50 Q50 22 70 50 L70 44 Q50 30 30 44Z" fill="#e8eef4" />
        <path d="M28 48 Q50 30 72 48 L72 52 L28 52Z" fill="#7a5a3a" />
        <rect x="27" y="49" width="46" height="5" rx="2" fill="#f4f6f8" />
        <circle cx="44" cy="58" r="2" fill="#2a1a10" /><circle cx="56" cy="58" r="2" fill="#2a1a10" />
        <path d="M40 66 Q50 76 60 66 Q56 80 50 80 Q44 80 40 66Z" fill="#c8d0d8" />
        <text x="76" y="80" textAnchor="middle" fontSize="16" fill="#cfefff">❄</text>
      </g>}
      {who === 'beichen' && <g>
        {[[22, 26], [76, 22], [30, 74], [80, 64], [64, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#fff8d0" />)}
        <circle cx="46" cy="58" r="16" fill="#ead2b0" />
        <path d="M28 54 Q46 26 64 54 L64 46 Q46 34 28 46Z" fill="#3a3f8a" />
        <circle cx="41" cy="58" r="4.5" fill="none" stroke="#cfd6e0" strokeWidth="1.6" /><circle cx="51" cy="58" r="4.5" fill="none" stroke="#cfd6e0" strokeWidth="1.6" />
        <g transform="rotate(-30 70 60)"><rect x="60" y="56" width="26" height="7" rx="2" fill="#b8925a" /><rect x="84" y="55" width="5" height="9" fill="#7a5a2a" /></g>
      </g>}
      {who === 'aya' && <g>
        <circle cx="50" cy="56" r="16" fill="#f2d2b0" />
        <path d="M32 58 Q30 30 50 30 Q70 30 68 58 Q66 44 50 42 Q34 44 32 58Z" fill="#2a1a14" />
        <path d="M30 40 Q50 18 70 40 L66 46 Q50 34 34 46Z" fill="#b8322a" />
        <rect x="31" y="42" width="38" height="5" rx="2" fill="#f4e6d0" />
        <circle cx="44" cy="57" r="2" fill="#2a1a10" /><circle cx="56" cy="57" r="2" fill="#2a1a10" />
        <circle cx="41" cy="63" r="2.5" fill="#f0a0a0" opacity="0.6" /><circle cx="59" cy="63" r="2.5" fill="#f0a0a0" opacity="0.6" />
        <path d="M18 30 L24 18 M24 18 L20 14 M24 18 L30 14 M82 30 L76 18 M76 18 L80 14 M76 18 L70 14" stroke="#8a6a44" strokeWidth="2.5" fill="none" />
      </g>}
      {who === 'narrator' && <text x="50" y="62" textAnchor="middle" fontSize="34" fill="#f2cf7c">✒</text>}
    </svg>
  )
}

/** 剧情卡片（序章 / 章节完成 / 尾声 / 片尾字幕） */
export function StoryCard() {
  const cards = useStory((s) => s.cards)
  const screen = useGame((s) => s.screen)
  const settlement = useEco((s) => s.settlement)
  const card = cards[0]
  const show = !!card && !settlement
  // 航行中弹出时暂停
  useEffect(() => {
    if (show && screen === 'play') { useGame.setState({ screen: 'paused' }); useStory.setState({ pausedByCard: true }) }
  }, [show, screen])
  const close = () => {
    const rest = useStory.getState().cards.slice(1)
    useStory.setState({ cards: rest })
    if (!rest.length && useStory.getState().pausedByCard) {
      useStory.setState({ pausedByCard: false })
      if (useGame.getState().screen === 'paused') useGame.setState({ screen: 'play' })
    }
  }
  useEffect(() => {
    if (!show) return
    const k = (e: KeyboardEvent) => { const c = keyCodeOf(e); if (c === 'Enter' || c === 'NumpadEnter' || c === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [show, card])
  if (!show) return null
  if (card.kind === 'credits') {
    return (
      <div className="overlay story-wrap credits-wrap">
        <div className="credits">
          <div className="roll">
            <div className="gear-deco">⚙</div>
            <h1>{card.title}</h1>
            <p className="en">{card.sub}</p>
            {CREDITS.map(([k, v]) => <div key={k} className="cr"><small>{k}</small><b>{v}</b></div>)}
            <p className="thanks">感谢游玩</p>
          </div>
        </div>
        <button className="primary" onClick={close}>继续自由航行（Enter）</button>
      </div>
    )
  }
  const intro = card.kind === 'intro'
  return (
    <div className="overlay story-wrap">
      <div className={`panel brass story-card k-${card.kind}`}>
        <small className="sc-sub">{card.sub}</small>
        <h2>{card.title}</h2>
        <div className="dialog">
          {card.lines.map((l, i) => (
            <div key={i} className={`line ${l.who === 'narrator' ? 'narr' : ''}`} style={{ animationDelay: `${0.15 + i * 0.35}s` }}>
              {l.who !== 'narrator' && <Portrait who={l.who} size={58} />}
              <div className="bubble">
                {l.who !== 'narrator' && <div className="who"><b>{CHARS[l.who].name}</b><small>{CHARS[l.who].role}</small></div>}
                <p>{l.text}</p>
              </div>
            </div>
          ))}
        </div>
        {card.rewards && <div className="rewards"><span>章节奖励</span>{card.rewards.map((r) => <em key={r}>{r}</em>)}</div>}
        {card.next && <div className="next-ch">▶ {card.next}</div>}
        <button className="primary" onClick={close}>{intro ? '接手公司，开始航行（Enter）' : '继续（Enter）'}</button>
      </div>
    </div>
  )
}

/** HUD：当前章节目标 */
export function StoryTracker() {
  const e = useEco()
  const ch = currentChapter(e)
  const special = e.boss === 1 ? (
    <div className="tk-row tk-special"><i>🏴</i><span>特别篇「黑帆落幕」{e.mission?.mission === 'boss' ? '：前往黑帆锚地击沉黑帆号' : '：在云港公告板接取委托'}</span><em>{e.mission?.mission === 'boss' ? '进行中' : '可接'}</em></div>
  ) : null
  const fc = currentFrost(e)
  const rows = (objs: typeof CHAPTERS[number]['objs']) => objs.map((o) => {
    const done = objDone(o, e)
    const det = objDetail(o, e)
    return (
      <div key={o.id} className={`tk-row ${done ? 'done' : ''}`}>
        <i>{done ? '✔' : '◇'}</i>
        <span>{o.text.replace(/^主线：/, '')}{det && <small>{det}</small>}</span>
        <em>{progText(o, e)}</em>
      </div>
    )
  })
  const frost = fc ? <>
    <div className="tk-title tk-frost"><span>霜原篇 · 第{CN_NUM[fc.n - 1]}章</span><b>{fc.title}</b></div>
    {rows(fc.objs)}
  </> : null
  if (!ch) return special || frost ? <div className="tracker brass-frame">{frost}{special && <><div className="tk-title"><span>特别篇</span><b>黑帆落幕</b></div>{special}</>}</div> : null
  return (
    <div className="tracker brass-frame">
      <div className="tk-title"><span>主线 · 第{CN_NUM[ch.n - 1]}章</span><b>{ch.title}</b></div>
      {ch.objs.map((o) => {
        const done = objDone(o, e)
        const det = objDetail(o, e)
        return (
          <div key={o.id} className={`tk-row ${done ? 'done' : ''}`}>
            <i>{done ? '✔' : '◇'}</i>
            <span>{o.text.replace(/^主线：/, '')}{det && <small>{det}</small>}</span>
            <em>{progText(o, e)}</em>
          </div>
        )
      })}
      {frost}
      {special}
    </div>
  )
}

/** 金色提示条 */
export function Fanfares() {
  const list = useFanfare((s) => s.list)
  return (
    <div className="fanfares">
      {list.map((f) => (
        <div key={f.id} className={`fan k-${f.kind}`}>
          <i>{f.icon}</i>
          <div><b>{f.title}</b><span>{f.text}</span></div>
        </div>
      ))}
    </div>
  )
}

/** 港口公告板顶部：主线目标 + 云港商会还款 */
export function StoryBox({ island }: { island: string }) {
  const e = useEco()
  const ch = currentChapter(e)
  const fc = currentFrost(e)
  const debt = e.story.debt
  const pay = (n: number) => { const err = e.payDebt(n); if (err) e.note(err, true) }
  if (!ch && !fc && (island !== 'port' || debt <= 0)) return null
  return (
    <div className="story-box">
      {ch && <div className="sb-ch"><b>主线 · 第{CN_NUM[ch.n - 1]}章「{ch.title}」</b>
        <span>{ch.objs.map((o) => `${objDone(o, e) ? '✔' : '◇'} ${o.text.replace(/^主线：/, '')}（${progText(o, e)}）`).join('　')}</span></div>}
      {fc && <div className="sb-ch sb-frost"><b>霜原篇 · 第{CN_NUM[fc.n - 1]}章「{fc.title}」</b>
        <span>{fc.objs.map((o) => `${objDone(o, e) ? '✔' : '◇'} ${o.text.replace(/^主线：/, '')}（${progText(o, e)}）`).join('　')}</span></div>}
      {island === 'port' && debt > 0 && (
        <div className="sb-debt">
          <span>云港商会旧债 <b>{debt}</b> 银币</span>
          <button className="small" disabled={e.money < 1} onClick={() => pay(100)}>还 100</button>
          <button className="small" disabled={e.money < 1} onClick={() => pay(500)}>还 500</button>
          <button className="small primary" disabled={e.money < 1} onClick={() => pay(Math.min(debt, e.money))}>尽数偿还</button>
        </div>
      )}
    </div>
  )
}

/** 成就页 */
export function AchvSheet() {
  const { unlocked, life } = useAchv()
  const e = useEco()
  const n = ACHVS.filter((a) => unlocked[a.id]).length
  const close = () => useGame.getState().openSheet(null)
  return (
    <div className="overlay sheet-wrap">
      <div className="panel brass sheet achv-sheet">
        <div className="sheet-head"><div><small>— ACHIEVEMENTS —</small><h2>成就</h2></div><div className="achv-count"><b>{n}</b> / {ACHVS.length}<div className="bar"><i style={{ width: `${(n / ACHVS.length) * 100}%` }} /></div></div></div>
        <div className="achv-grid">
          {ACHVS.map((a) => {
            const on = !!unlocked[a.id]
            const [c, m] = a.prog(life, e)
            return (
              <div key={a.id} className={`achv ${on ? 'on' : ''}`}>
                <i>{on ? a.icon : '🔒'}</i>
                <div>
                  <b>{a.name}</b>
                  <small>{a.desc}</small>
                  {on ? <em className="when">✔ {new Date(unlocked[a.id]).toLocaleDateString('zh-CN')} 解锁</em>
                    : <div className="ap"><div className="bar"><i style={{ width: `${Math.min(1, c / m) * 100}%` }} /></div><em>{achvProgText(a, life, e)}</em></div>}
                </div>
              </div>
            )
          })}
        </div>
        <div className="sheet-foot"><small>成就独立于存档保存，开始新的航程不会清空。</small><button className="primary" onClick={close}>关闭（Esc）</button></div>
      </div>
    </div>
  )
}

/** 航运日志：公司状况与主线章节 */
export function LogSheet() {
  const e = useEco()
  const close = () => useGame.getState().openSheet(null)
  const ch = e.story.ch
  return (
    <div className="overlay sheet-wrap">
      <div className="panel brass sheet log-sheet">
        <div className="sheet-head"><div><small>— CAPTAIN'S LOG —</small><h2>航运日志</h2></div>
          {e.started && <div className="co-info">
            <span>银币 <Coin v={e.money} /></span>
            <span>旧债 <b>{e.story.debt > 0 ? e.story.debt : '已还清'}</b></span>
            <span>交付 <b>{e.stats.deliveries}</b> 单</span>
            <span>航程 <b>{fmtDist(e.stats.distance)}</b></span>
          </div>}
        </div>
        {!e.started ? <div className="empty">还没有开始航程。点击「新的航程」接手云港航运公司吧。</div> : (
          <div className="chapters">
            <div className="chap done">
              <div className="ch-h"><i>✔</i><b>序章 · 老信天翁</b><small>继承只剩一条老飞艇、背着 1200 银币旧债的云港航运公司。</small>
                <button className="small" onClick={() => pushCard(introCard())}>重温</button></div>
            </div>
            {CHAPTERS.map((c) => {
              const st = c.n < ch ? 'done' : c.n === ch ? 'cur' : 'lock'
              return (
                <div key={c.n} className={`chap ${st}`}>
                  <div className="ch-h">
                    <i>{st === 'done' ? '✔' : st === 'cur' ? '▶' : '🔒'}</i>
                    <b>第{CN_NUM[c.n - 1]}章 · {st === 'lock' ? '？？？' : c.title}</b>
                    <small>{st === 'lock' ? '完成前一章后解锁' : c.summary}</small>
                    {st === 'done' && <button className="small" onClick={(ev) => { ev.stopPropagation(); pushCard(chapterCard(c)) }}>重温</button>}
                  </div>
                  {st === 'cur' && (
                    <ul className="objs">
                      {c.objs.map((o) => <li key={o.id} className={objDone(o, e) ? 'ok' : ''}><span>{objDone(o, e) ? '✔' : '◇'} {o.text}{objDetail(o, e) && <small>（{objDetail(o, e)}）</small>}</span><em>{progText(o, e)}</em></li>)}
                      <li className="rw"><span>奖励：{c.reward.money} 银币{c.reward.livery ? ' · 新涂装' : ''}{c.reward.extra ? ` · ${c.reward.extra}` : ''}</span></li>
                    </ul>
                  )}
                </div>
              )
            })}
            {(e.story.fch ?? 0) > 0 && <div className="chap done frost-h"><div className="ch-h"><i>❄</i><b>霜原篇 · 霜原来信</b><small>一封来自北方冰港的求援信。</small>
              <button className="small" onClick={() => pushCard(frostUnlockCard())}>重温</button></div></div>}
            {(e.story.fch ?? 0) > 0 && FCHAPTERS.map((c) => {
              const fch = e.story.fch
              const st = c.n < fch ? 'done' : c.n === fch ? 'cur' : 'lock'
              return (
                <div key={`f${c.n}`} className={`chap ${st} frost`}>
                  <div className="ch-h">
                    <i>{st === 'done' ? '✔' : st === 'cur' ? '▶' : '🔒'}</i>
                    <b>霜原篇 第{CN_NUM[c.n - 1]}章 · {st === 'lock' ? '？？？' : c.title}</b>
                    <small>{st === 'lock' ? '完成前一章后解锁' : c.summary}</small>
                    {st === 'done' && <button className="small" onClick={() => pushCard(frostChapterCard(c))}>重温</button>}
                  </div>
                  {st === 'cur' && (
                    <ul className="objs">
                      {c.objs.map((o) => <li key={o.id} className={objDone(o, e) ? 'ok' : ''}><span>{objDone(o, e) ? '✔' : '◇'} {o.text}{objDetail(o, e) && <small>（{objDetail(o, e)}）</small>}</span><em>{progText(o, e)}</em></li>)}
                      <li className="rw"><span>奖励：{c.reward.money} 银币{c.reward.livery ? ' · 涂装「极光」' : ''}</span></li>
                    </ul>
                  )}
                </div>
              )
            })}
            {(e.story.fch ?? 0) > FCHAPTERS.length && <div className="chap done frost"><div className="ch-h"><i>🌌</i><b>尾声 · 北境极光</b><small>两片群岛共享同一片天空。</small>
              <button className="small" onClick={() => pushCard(frostEndCard())}>重看</button></div></div>}
            {(e.story.fch ?? 0) === 0 && e.story.ch >= 5 && <div className="chap lock"><div className="ch-h"><i>❄</i><b>霜原篇 · ？？？</b><small>完成主线第五章后，北方会来一封信。</small></div></div>}
            {e.story.ended && <div className="chap done"><div className="ch-h"><i>🗼</i><b>尾声 · 云港之光</b><small>云港灯塔重新亮起。主线完结，天空永远有下一单。</small>
              <button className="small" onClick={() => { pushCard(endingCard()); pushCard(creditsCard()) }}>重看结局</button></div></div>}
          </div>
        )}
        <div className="sheet-foot"><small>点击进行中的章节查看目标；带「主线」金边的委托会出现在相关港口的公告板上。</small><button className="primary" onClick={close}>关闭（Esc）</button></div>
      </div>
    </div>
  )
}
