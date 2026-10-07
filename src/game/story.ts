import { create } from 'zustand'
import { islandName, storyContract, useEco, type Contract, type Kind } from './economy'
import { emit, hooks, onEvent } from './events'
import { fanfare } from './fanfare'
import { PART_IDS, shipMods } from './upgrades'
import { hullOf } from './hulls'
import { hasArms } from './weapons'
import { ISLANDS, regionOfIsland } from './world'

/**
 * 主线剧情：继承破败的「云港航运公司」（一条老飞艇 + 1200 银币旧债），
 * 一步步重建公司，最终让熄灭七年的云港灯塔重新亮起。
 * 进度存放在存档 useEco().story 中；剧情卡片队列不存档。
 */

// ---------------- 角色 ----------------
export type CharId = 'captain' | 'keeper' | 'smith' | 'light' | 'crow' | 'narrator' | 'birch' | 'beichen' | 'aya'
export const CHARS: Record<CharId, { name: string; role: string }> = {
  captain: { name: '严老船长', role: '云港航运公司创始人' },
  keeper: { name: '钱掌柜', role: '云港商会 · 码头掌柜' },
  smith: { name: '铁婆婆', role: '工坊城 · 老匠人' },
  light: { name: '林守灯', role: '灯塔岛 · 灯塔看守' },
  crow: { name: '黑鸦', role: '黑帆空贼 · 头目' },
  birch: { name: '白桦', role: '霜原 · 冰港港务长' },
  beichen: { name: '北辰', role: '霜原 · 观星台学者' },
  aya: { name: '阿雅', role: '霜原 · 驯鹿牧场牧人' },
  narrator: { name: '', role: '' },
}

// ---------------- 目标 ----------------
type Base = { id: string; text: string }
export type Objective = Base & (
  | { type: 'deliver'; n: number }
  | { type: 'story'; from: string; to: string; goods: string; kind: Kind; weight: number; reward: number; minCond?: number; melt?: boolean }
  | { type: 'partLv'; lv: number }
  | { type: 'fragileGood'; n: number }
  | { type: 'rep'; island: string; n: number }
  | { type: 'stormDeliver'; n: number }
  | { type: 'nightDeliver'; n: number }
  | { type: 'pirate'; n: number }
  | { type: 'fogDock'; n: number }
  | { type: 'visit'; islands: string[] }
  | { type: 'debt' }
  | { type: 'total'; n: number }
  // v1.3 霜原篇
  | { type: 'ceiling'; n: number }
  | { type: 'longHaul'; n: number }
  | { type: 'frostNight'; n: number }
)

export type Line = { who: CharId; text: string }
export type Chapter = {
  n: number
  title: string
  summary: string
  objs: Objective[]
  reward: { money: number; livery?: string; extra?: string }
  outro: Line[]
}

export const CHAPTERS: Chapter[] = [
  {
    n: 1, title: '旧船新主', summary: '接手只剩一条老飞艇的云港航运，把公司账簿送到工坊城。',
    objs: [
      { id: 'c1-del', text: '完成 2 次货物交付', type: 'deliver', n: 2 },
      { id: 'c1-ledger', text: '主线：把「公司账簿」送到工坊城', type: 'story', from: 'port', to: 'workshop', goods: '公司账簿', kind: 'normal', weight: 0.5, reward: 120 },
    ],
    reward: { money: 200 },
    outro: [
      { who: 'smith', text: '严家的账簿？……那老家伙终于肯交班了。' },
      { who: 'smith', text: '这条「老信天翁」的锅炉还是我年轻时亲手铆的。你想让云港灯塔重新亮起来？先让我看看你的本事。' },
      { who: 'captain', text: '铁婆婆嘴硬心软。去升级一下老船，再证明你能把易碎的货稳稳送到——她就会帮你。' },
    ],
  },
  {
    n: 2, title: '工坊的考验', summary: '升级飞艇、稳稳运送易碎品，赢得工坊城的信任。',
    objs: [
      { id: 'c2-part', text: '任意一个部件升到 Lv2（云港或工坊城改装）', type: 'partLv', lv: 2 },
      { id: 'c2-fragile', text: '易碎品完好（≥90%）送达 1 次', type: 'fragileGood', n: 1 },
      { id: 'c2-rep', text: '工坊城声望达到 5', type: 'rep', island: 'workshop', n: 5 },
    ],
    reward: { money: 300 },
    outro: [
      { who: 'smith', text: '手稳，船也像样了。灯塔那只巨型齿轮我能重铸——可我需要原来的图纸。' },
      { who: 'smith', text: '图纸在灯塔岛的林守灯手里。他那儿的灯油快烧完了，你顺路给他送去。' },
      { who: 'captain', text: '林守灯是我的老伙计。灯塔岛在西陲，夜里朝着那道光飞就不会迷路。小心雷暴季。' },
    ],
  },
  {
    n: 3, title: '夜色与雷鸣', summary: '冒着雷暴与夜色，把灯油加急送往西陲的灯塔岛。',
    objs: [
      { id: 'c3-oil', text: '主线：把「灯油」加急送到灯塔岛', type: 'story', from: 'port', to: 'beacon', goods: '灯油（主线）', kind: 'urgent', weight: 1.2, reward: 160 },
      { id: 'c3-night', text: '夜间（19:30–5:00）完成 1 次交付', type: 'nightDeliver', n: 1 },
      { id: 'c3-storm', text: '穿越雷暴后送达货物 1 次', type: 'stormDeliver', n: 1 },
    ],
    reward: { money: 400 },
    outro: [
      { who: 'light', text: '好小子，顶着雷暴把灯油送来了！严老头没看错人。' },
      { who: 'light', text: '图纸给你。不过最近「黑帆」空贼盯上了运货的飞艇，他们的头目叫黑鸦，专挑载着贵货的船下手。' },
      { who: 'crow', text: '（传声筒里沙哑的笑声）听说云港又冒出个不怕死的新船长？货留下，船就能走。' },
    ],
  },
  {
    n: 4, title: '黑帆', summary: '甩开黑帆空贼，穿过浓雾，把云港航运的旗号插到群岛最远处。',
    objs: [
      { id: 'c4-pirate', text: '甩掉或击退空贼 1 次（逃进港口、雷暴、拉开距离，或用武器击落）', type: 'pirate', n: 1 },
      { id: 'c4-fog', text: '在浓雾中靠泊 1 次（黎明晨雾或雾区）', type: 'fogDock', n: 1 },
      { id: 'c4-far', text: '造访远岛：芦苇礁 · 余烬岛 · 松风屿', type: 'visit', islands: ['reed', 'ember', 'pine'] },
    ],
    reward: { money: 500, livery: 'crow' },
    outro: [
      { who: 'crow', text: '……有两下子。连我的钩索都抓不住你。这面黑帆，就当是见面礼。' },
      { who: 'light', text: '黑鸦以前也是云港的船员。灯塔熄了以后，夜航的生意没了，好多人就上了黑帆。' },
      { who: 'captain', text: '要让灯塔复明，先得把公司的旧账了结。回云港找钱掌柜吧。' },
    ],
  },
  {
    n: 5, title: '清偿旧债', summary: '还清欠云港商会的旧债，让云港航运重新立住招牌。',
    objs: [
      { id: 'c5-debt', text: '还清云港商会旧债（在云港「委托」页还款）', type: 'debt' },
      { id: 'c5-rep', text: '云港声望达到 12', type: 'rep', island: 'port', n: 12 },
      { id: 'c5-total', text: '累计交付 15 单', type: 'total', n: 15 },
    ],
    reward: { money: 600, extra: '解锁终章委托' },
    outro: [
      { who: 'keeper', text: '一笔一笔，全清了！严老头的公司，从今天起干干净净。' },
      { who: 'keeper', text: '商会决定出钱重修云港灯塔：铁婆婆铸好的巨型齿轮在工坊城，新磨的透镜在灯塔岛。' },
      { who: 'keeper', text: '这趟活，整个群岛只信得过云港航运。别把透镜磕坏了——那可是全群岛唯一的一片。' },
    ],
  },
  {
    n: 6, title: '灯塔复明', summary: '运送巨型齿轮与灯塔透镜，让熄灭七年的云港灯塔重新亮起。',
    objs: [
      { id: 'c6-gear', text: '主线：从工坊城运送「巨型齿轮」到云港', type: 'story', from: 'workshop', to: 'port', goods: '巨型齿轮', kind: 'heavy', weight: 6.5, reward: 600 },
      { id: 'c6-lens', text: '主线：从灯塔岛运送「灯塔透镜」到云港（完好度 ≥80%）', type: 'story', from: 'beacon', to: 'port', goods: '灯塔透镜', kind: 'fragile', weight: 1.2, reward: 500, minCond: 0.8 },
    ],
    reward: { money: 1000, livery: 'beacon' },
    outro: [
      { who: 'smith', text: '齿轮咬合，分毫不差！我这把老骨头总算没白敲。' },
      { who: 'light', text: '透镜完好无损……点灯吧！' },
      { who: 'captain', text: '七年了……云港的灯，又亮了。孩子，公司是你的了——这片天空也是。' },
    ],
  },
]

// ---------------- v1.3 霜原篇「霜原来信」 ----------------
export const FCHAPTERS: Chapter[] = [
  {
    n: 1, title: '霜原来信', summary: '一封盖着冰港火漆的求援信：升级气囊，越过北方的强风墙，把救援药品送到冰港。',
    objs: [
      { id: 'f1-ceil', text: '飞艇升限达到 500 米（气囊 Lv3，或轻型快艇 + 气囊 Lv2）', type: 'ceiling', n: 500 },
      { id: 'f1-med', text: '主线：把「救援药品」从云港加急送到冰港（飞越强风墙高空通道）', type: 'story', from: 'port', to: 'icehub', goods: '救援药品', kind: 'urgent', weight: 1, reward: 300 },
      { id: 'f1-visit', text: '造访霜原：冰晶矿 · 驯鹿牧场 · 温泉谷', type: 'visit', islands: ['crystal', 'reindeer', 'hotspring'] },
    ],
    reward: { money: 800 },
    outro: [
      { who: 'birch', text: '药品到了！整个冬天，冰港的炉火都靠它撑着……多谢你，云港的船长。' },
      { who: 'aya', text: '我的驯鹿没再咳嗽了。听说你是第一个穿过风墙的南方飞艇？' },
      { who: 'birch', text: '风墙把霜原和南方隔开了二十年。如果商路能通，冰港就不用再挨饿——我们想和云港做生意。' },
    ],
  },
  {
    n: 2, title: '冰与火', summary: '霜原的冰块与温泉蛋，云港的煤与零件——打通两片群岛之间的长途商路。',
    objs: [
      { id: 'f2-ice', text: '主线：从冰港运送「冰块」到云港（剩余量 ≥60%，白天会更快融化）', type: 'story', from: 'icehub', to: 'port', goods: '冰港冰块', kind: 'normal', weight: 2, reward: 500, minCond: 0.6, melt: true },
      { id: 'f2-egg', text: '主线：把「温泉蛋」从温泉谷加急送到北境哨塔', type: 'story', from: 'hotspring', to: 'watchtower', goods: '温泉蛋（主线）', kind: 'urgent', weight: 0.8, reward: 260 },
      { id: 'f2-long', text: '完成 2 次跨区长途委托（云港群岛 ⇄ 霜原群岛）', type: 'longHaul', n: 2 },
    ],
    reward: { money: 1000 },
    outro: [
      { who: 'keeper', text: '冰港的冰块在云港卖疯了！夏天的鱼铺、果园、酒馆全在抢。新东家，这条商路值金子。' },
      { who: 'aya', text: '哨塔的守卫说，温泉蛋还是热的——你飞得比雪狐还快。' },
      { who: 'beichen', text: '船长，我在观星台等你很久了。今冬的极光会是百年来最亮的一次，我需要一样东西……' },
    ],
  },
  {
    n: 3, title: '极光之下', summary: '把冰晶矿深处的极光晶石完好地送上观星台，在极光之夜点亮北境。',
    objs: [
      { id: 'f3-gem', text: '主线：从冰晶矿运送「极光晶石」到观星台（完好度 ≥80%，极易碎）', type: 'story', from: 'crystal', to: 'observatory', goods: '极光晶石（主线）', kind: 'fragile', weight: 0.6, reward: 600, minCond: 0.8 },
      { id: 'f3-night', text: '在霜原群岛夜间（19:30–5:00）完成 1 次交付', type: 'frostNight', n: 1 },
    ],
    reward: { money: 1500, livery: 'aurora' },
    outro: [
      { who: 'beichen', text: '晶石嵌进了望远镜的光路……看！极光顺着镜筒落下来了，整个夜空都在唱歌。' },
      { who: 'birch', text: '冰港议事会决定：从今往后，冰港的码头永远为云港航运留一个泊位。' },
      { who: 'aya', text: '这身「极光」涂装是牧场的姑娘们一针一线缝的。穿上它，北境的每一盏灯都认得你。' },
    ],
  },
]
export const FROST_UNLOCK: Line[] = [
  { who: 'keeper', text: '新东家，有你一封信——信封冻得硬邦邦的，火漆上印着一片雪花。' },
  { who: 'birch', text: '（信）「致云港航运：我是霜原冰港的港务长白桦。今冬奇寒，药品与煤都快断了。南方的船都被强风墙挡了回去……」' },
  { who: 'captain', text: '霜原群岛就在云海正北，隔着一道终年不散的强风墙。只有升限够高的飞艇，才能从风墙上空的高空通道穿过去。' },
  { who: 'smith', text: '把气囊升到第三级，升限就有 500 米。到了霜原记得给锅炉装个防寒罩，冷风会把煤吃得飞快。' },
]
export const FROST_EPILOGUE: Line[] = [
  { who: 'narrator', text: '极光之夜，观星台的穹顶缓缓打开。绿色与紫色的光帘从北境一直铺到风墙之上。' },
  { who: 'beichen', text: '从云港也能看见吗？那就好——两片群岛，从今天起共享同一片天空。' },
  { who: 'captain', text: '（来信）孩子，老信天翁当年也没飞过风墙。你做到了。' },
]
export const frostUnlockCard = (): Card => ({ kind: 'chapter', title: '新篇章 · 霜原来信', sub: '— 一封来自北方的信 —', lines: FROST_UNLOCK, next: `霜原篇第一章「${FCHAPTERS[0].title}」：${FCHAPTERS[0].summary}` })
export function frostChapterCard(ch: Chapter): Card {
  const nx = FCHAPTERS[ch.n]
  const rewards = [`${ch.reward.money} 银币`]
  if (ch.reward.livery) rewards.push('涂装「极光」')
  return { kind: 'chapter', title: `霜原篇 第${CN_NUM[ch.n - 1]}章 · ${ch.title}`, sub: '— 章节完成 —', lines: ch.outro, rewards, next: nx ? `霜原篇第${CN_NUM[nx.n - 1]}章「${nx.title}」：${nx.summary}` : undefined }
}
export const frostEndCard = (): Card => ({ kind: 'ending', title: '尾声 · 北境极光', sub: '— 霜原篇完结 —', lines: FROST_EPILOGUE, next: '霜原篇已完结：跨区长途委托会继续出现在两片群岛的公告板上。' })

export const INTRO: Line[] = [
  { who: 'captain', text: '孩子，这把舵轮交给你了。云港航运当年有十二条飞艇，如今只剩这条「老信天翁」。' },
  { who: 'captain', text: '七年前一场雷暴砸坏了云港灯塔的巨型齿轮。灯一熄，夜航的船少了，生意也就散了。' },
  { who: 'keeper', text: '新东家，严老头还欠商会 1200 银币。账我记得清清楚楚——慢慢还，利息就免了。' },
  { who: 'captain', text: '先接几单小活练练手，再把公司的账簿送到工坊城交给铁婆婆。她会帮你的。' },
]
export const ENDING: Line[] = [
  { who: 'narrator', text: '那一夜，云港灯塔的光柱重新扫过云海。远方的飞艇一艘接一艘亮起航行灯，朝着光芒归港。' },
  { who: 'keeper', text: '商会的订单排到了明年开春。新东家，再买几条船吧！' },
  { who: 'crow', text: '……那道光，我在云海另一头也看见了。也许，是时候收起黑帆了。' },
  { who: 'captain', text: '去吧，船长。群岛还很大，天空永远有下一单。' },
]
export const CREDITS: [string, string][] = [
  ['出品', '大王'],
  ['策划 · 程序 · 美术 · 文案', 'Grok Bot'],
  ['引擎与工具', 'three.js · React Three Fiber · drei · zustand · Vite'],
  ['特别感谢', '每一位在云海上送货的船长'],
]

// ---------------- 剧情卡片队列（不存档） ----------------
export type Card =
  | { kind: 'intro' | 'chapter' | 'ending'; title: string; sub: string; lines: Line[]; rewards?: string[]; next?: string }
  | { kind: 'credits'; title: string; sub: string }
type StoryUi = { cards: Card[]; pausedByCard: boolean }
export const useStory = create<StoryUi>(() => ({ cards: [], pausedByCard: false }))
export const pushCard = (c: Card) => useStory.setState((s) => ({ cards: [...s.cards, c] }))
export const CN_NUM = '一二三四五六七八九十'

export const introCard = (): Card => ({ kind: 'intro', title: '序章 · 老信天翁', sub: '云港航运公司 · 交接', lines: INTRO, next: `第一章「${CHAPTERS[0].title}」：${CHAPTERS[0].summary}` })
export function chapterCard(ch: Chapter): Card {
  const nx = CHAPTERS[ch.n]
  const rewards = [`${ch.reward.money} 银币`]
  if (ch.reward.livery) rewards.push(`涂装「${ch.reward.livery === 'crow' ? '夜鸦' : '灯塔金辉'}」`)
  if (ch.reward.extra) rewards.push(ch.reward.extra)
  return { kind: 'chapter', title: `第${CN_NUM[ch.n - 1]}章 · ${ch.title}`, sub: '— 章节完成 —', lines: ch.outro, rewards, next: nx ? `第${CN_NUM[nx.n - 1]}章「${nx.title}」：${nx.summary}` : undefined }
}
export const endingCard = (): Card => ({ kind: 'ending', title: '尾声 · 云港之光', sub: '— 主线完结 —', lines: ENDING, next: '主线已完结，你可以继续自由经营：接单、改装、收集成就。' })
export const creditsCard = (): Card => ({ kind: 'credits', title: '云港航运', sub: 'AIRSHIP CARGO' })

export const bossUnlockCard = (ended: boolean): Card => ({
  kind: 'chapter', title: '特别篇 · 黑帆落幕', sub: '— 新的委托 —',
  lines: [
    { who: 'keeper', text: '船长！商会的瞭望哨在云海南缘发现了「黑帆号」——黑鸦的旗舰，比普通空贼船大三倍，两舷全是炮。' },
    { who: 'light', text: ended ? '灯塔复明以后，黑帆的人心散了大半。可黑鸦还带着最后一批死忠，盘踞在南缘的锚地里。' : '黑帆最近越来越猖狂，连护航的商船都敢劫。只要黑帆号还在，群岛就没有太平日子。' },
    { who: 'captain', text: '老信天翁已经装上了炮。准备好了就去云港接下这份委托，把这件事了结吧。小心它的侧舷齐射。' },
  ],
  next: '特别篇：在云港公告板接取「击沉黑帆号」，前往云海南缘的黑帆锚地（建议：机炮 Lv2、装甲 Lv2 以上，带足照明弹）',
})

// ---------------- 进度 ----------------
type Eco = ReturnType<typeof useEco.getState>
export function progress(o: Objective, e: Eco, p: Record<string, number> = e.story.prog): [number, number] {
  switch (o.type) {
    case 'ceiling': return [Math.min(o.n, shipMods(e.parts, hullOf(e.hull)).ceiling), o.n]
    case 'deliver': case 'fragileGood': case 'stormDeliver': case 'nightDeliver': case 'pirate': case 'fogDock': case 'longHaul': case 'frostNight':
      return [Math.min(o.n, p[o.id] ?? 0), o.n]
    case 'story': return [p[o.id] ? 1 : 0, 1]
    case 'partLv': return [Math.min(o.lv, Math.max(...PART_IDS.map((k) => e.parts[k]))) >= o.lv ? 1 : 0, 1]
    case 'rep': return [Math.min(o.n, e.rep[o.island] ?? 0), o.n]
    case 'visit': return [o.islands.filter((i) => p[`${o.id}:${i}`]).length, o.islands.length]
    case 'debt': return [e.story.debt <= 0 ? 1 : 0, 1]
    case 'total': return [Math.min(o.n, e.stats.deliveries), o.n]
  }
}
export const objDone = (o: Objective, e: Eco) => { const [a, b] = progress(o, e, o.id.startsWith('f') ? e.story.fprog ?? {} : e.story.prog); return a >= b }
export const currentChapter = (e: Eco) => CHAPTERS[e.story.ch - 1] ?? null
/** 当前霜原篇章节（未解锁 / 已完成为 null） */
export const currentFrost = (e: Eco) => ((e.story.fch ?? 0) >= 1 ? FCHAPTERS[(e.story.fch ?? 0) - 1] ?? null : null)
export const isFrostObj = (o: Objective) => o.id.startsWith('f')
/** 进度文字（如 2/3、120/1500） */
export function progText(o: Objective, e: Eco) {
  if (o.type === 'debt') return e.story.debt <= 0 ? '已还清' : `剩 ${e.story.debt}`
  if (o.type === 'ceiling') { const [a, b] = progress(o, e); return a >= b ? '完成' : `${a}/${b} 米` }
  const [a, b] = progress(o, e, isFrostObj(o) ? e.story.fprog ?? {} : e.story.prog)
  return b > 1 ? `${a}/${b}` : a >= b ? '完成' : '0/1'
}
/** 目标的补充说明（visit 显示哪些岛已到） */
export function objDetail(o: Objective, e: Eco) {
  const p = isFrostObj(o) ? e.story.fprog ?? {} : e.story.prog
  if (o.type === 'visit') return o.islands.map((i) => `${islandName(i)}${p[`${o.id}:${i}`] ? '✔' : ''}`).join(' · ')
  return ''
}

// 主线委托注入公告板
hooks.storyContracts = (island: string): Contract[] => {
  const e = useEco.getState()
  const out: Contract[] = []
  const add = (ch: Chapter | null, prog: Record<string, number>) => {
    if (!ch) return
    for (const o of ch.objs) if (o.type === 'story' && o.from === island && !prog[o.id]) out.push(storyContract(o.id, o.from, o.to, o.goods, o.kind, o.weight, o.reward, o.minCond, o.melt ? { melt: true } : undefined))
  }
  add(currentChapter(e), e.story.prog)
  add(currentFrost(e), e.story.fprog ?? {})
  return out
}

// 事件 → 计数
onEvent((ev) => {
  const e = useEco.getState()
  if (!e.started) return
  const ch = currentChapter(e)
  if (ch) { const prog = countObjs(ch, e.story.prog, ev, e); if (prog) e.setStory({ prog }) }
  const fc = currentFrost(e)
  if (fc) { const fprog = countObjs(fc, useEco.getState().story.fprog ?? {}, ev, useEco.getState()); if (fprog) useEco.getState().setStory({ fprog }) }
})
function countObjs(ch: Chapter, prog0: Record<string, number>, ev: Parameters<Parameters<typeof onEvent>[0]>[0], e: Eco): Record<string, number> | null {
  const prog = { ...prog0 }
  let changed = false
  const inc = (id: string) => { prog[id] = (prog[id] ?? 0) + 1; changed = true }
  for (const o of ch.objs) {
    if (ev.t === 'deliver') {
      const c = ev.c
      if (o.type === 'deliver') inc(o.id)
      if (o.type === 'fragileGood' && c.kind === 'fragile' && c.condition >= 0.9) inc(o.id)
      if (o.type === 'stormDeliver' && (c.flags ?? []).includes('storm')) inc(o.id)
      if (o.type === 'nightDeliver' && ev.night) inc(o.id)
      if (o.type === 'longHaul' && !c.story && (c.long || regionOfIsland(c.from) !== regionOfIsland(c.to))) inc(o.id)
      if (o.type === 'frostNight' && ev.night && regionOfIsland(c.to) === 'frost') inc(o.id)
      if (o.type === 'story' && c.story === o.id) {
        if (o.minCond && c.condition < o.minCond) {
          e.note(`「${c.goods}」${c.melt ? '剩余量' : '完好度'}只有 ${Math.round(c.condition * 100)}%，不合格！${islandName(o.from)}又备好了一件，请重新运送`, true)
        } else { prog[o.id] = 1; changed = true }
      }
    } else if (ev.t === 'dock' && !ev.tow) {
      if (o.type === 'fogDock' && ev.fog > 0.35) inc(o.id)
      if (o.type === 'visit' && o.islands.includes(ev.island) && !prog[`${o.id}:${ev.island}`]) { prog[`${o.id}:${ev.island}`] = 1; changed = true }
    } else if (ev.t === 'pirateShaken') {
      if (o.type === 'pirate') inc(o.id)
    }
  }
  return changed ? prog : null
}

// ---------------- 检查与章节推进 ----------------
let last: Record<string, number> = {}
let lastCh = -1
let busy = false
/** 状态变化时调用：发进度提示、判断章节完成 */
export function checkStory() {
  if (busy) return
  const e = useEco.getState()
  if (!e.started) { lastCh = -1; return }
  // v1.2 特别篇「黑帆落幕」：主线完结后，或第四章之后且装备了武器时解锁
  if ((e.boss ?? 0) === 0 && (e.story.ch >= 7 || (e.story.ch >= 5 && hasArms(e.weapons)))) {
    busy = true
    useEco.setState({ boss: 1 })
    busy = false
    pushCard(bossUnlockCard(e.story.ch >= 7))
    fanfare('chapter', '🏴', '特别篇解锁', '「黑帆落幕」 · 在云港公告板接取委托', 6500)
  }
  // v1.3 霜原篇：第五章完成后（主线进入终章或已完结）解锁
  if ((e.story.fch ?? 0) === 0 && e.story.ch >= 6) {
    busy = true
    useEco.getState().setStory({ fch: 1, fprog: {} })
    busy = false
    pushCard(frostUnlockCard())
    fanfare('chapter', '❄', '新篇章解锁', '「霜原来信」 · 越过北方的强风墙', 6500)
  }
  checkFrost()
  const ch = currentChapter(useEco.getState())
  if (!ch) return
  const silent = lastCh !== e.story.ch
  if (silent) { last = {}; lastCh = e.story.ch }
  let all = true
  for (const o of ch.objs) {
    const [a, b] = progress(o, e)
    const prev = last[o.id]
    if (!silent && prev !== undefined && a > prev) {
      if (a >= b) fanfare('done', '✔', '目标完成', o.text)
      else if (o.type !== 'rep' && o.type !== 'total') fanfare('obj', '◆', `目标进度 ${a}/${b}`, o.text, 3800)
    }
    last[o.id] = a
    if (a < b) all = false
  }
  if (all) completeChapter(ch)
}

function completeChapter(ch: Chapter) {
  busy = true
  const e = useEco.getState()
  const liveries = ch.reward.livery && !e.liveries.includes(ch.reward.livery) ? [...e.liveries, ch.reward.livery] : e.liveries
  useEco.setState({
    money: e.money + ch.reward.money,
    liveries,
    stats: { ...e.stats, earnings: e.stats.earnings + ch.reward.money },
    story: { ...e.story, ch: ch.n + 1, prog: {}, done: { ...e.story.done, [ch.n]: e.stats.deliveries }, ended: e.story.ended || ch.n === CHAPTERS.length },
  })
  fanfare('chapter', '📜', `第${CN_NUM[ch.n - 1]}章完成`, `「${ch.title}」 · 奖励 ${ch.reward.money} 银币${ch.reward.livery ? ' · 新涂装' : ''}`, 6500)
  pushCard(chapterCard(ch))
  if (ch.n === CHAPTERS.length) { pushCard(endingCard()); pushCard(creditsCard()) }
  busy = false
  emit({ t: 'storyDone', ch: ch.n })
  if (ch.n === CHAPTERS.length) emit({ t: 'ended' })
  checkStory()
}

let lastF: Record<string, number> = {}
let lastFch = -1
function checkFrost() {
  const e = useEco.getState()
  const ch = currentFrost(e)
  if (!ch) return
  const silent = lastFch !== e.story.fch
  if (silent) { lastF = {}; lastFch = e.story.fch }
  let all = true
  for (const o of ch.objs) {
    const [a, b] = progress(o, e, e.story.fprog ?? {})
    const prev = lastF[o.id]
    if (!silent && prev !== undefined && a > prev) {
      if (a >= b) fanfare('done', '✔', '霜原篇目标完成', o.text)
      else if (o.type !== 'ceiling') fanfare('obj', '◆', `霜原篇进度 ${a}/${b}`, o.text, 3800)
    }
    lastF[o.id] = a
    if (a < b) all = false
  }
  if (!all) return
  busy = true
  const liveries = ch.reward.livery && !e.liveries.includes(ch.reward.livery) ? [...e.liveries, ch.reward.livery] : e.liveries
  const last = ch.n === FCHAPTERS.length
  useEco.setState({
    money: e.money + ch.reward.money,
    liveries,
    stats: { ...e.stats, earnings: e.stats.earnings + ch.reward.money },
    story: { ...e.story, fch: ch.n + 1, fprog: {} },
  })
  fanfare('chapter', '❄', `霜原篇第${CN_NUM[ch.n - 1]}章完成`, `「${ch.title}」 · 奖励 ${ch.reward.money} 银币${ch.reward.livery ? ' · 新涂装「极光」' : ''}`, 6500)
  pushCard(frostChapterCard(ch))
  if (last) pushCard(frostEndCard())
  busy = false
  emit({ t: 'frostCh', ch: ch.n })
  if (last) emit({ t: 'frostDone' })
  checkStory()
}

useEco.subscribe(() => checkStory())

/** 全部岛屿 id（调试 / 日志用） */
export const ALL_ISLANDS = ISLANDS.map((i) => i.id)
