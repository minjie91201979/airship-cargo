import type { Cargo, Contract, Mission } from './economy'

/**
 * 游戏事件总线：经济 / 会话 / 险情模块发出事件，主线（story）与成就（achv）模块订阅。
 * 本文件不依赖其它游戏模块，避免循环引用。
 */
export type GameEvent =
  | { t: 'deliver'; c: Cargo; onTime: boolean; night: boolean; total: number }
  | { t: 'dock'; island: string; fog: number; glide: boolean; tow: boolean }
  | { t: 'pirateShaken' }
  | { t: 'storyDone'; ch: number }
  | { t: 'ended' }
  | { t: 'bigDelivery'; n: number; hull: string }
  | { t: 'frostDone' }
  | { t: 'frostCh'; ch: number }
  | { t: 'newGame' }
  | { t: 'mission'; m: Mission }
  | { t: 'missionEnd'; m: Mission; ok: boolean; hp?: number }
  | { t: 'kill'; kind: string; harpooned: boolean; boss: boolean }

type Fn = (e: GameEvent) => void
const subs: Fn[] = []
export const onEvent = (fn: Fn) => { subs.push(fn) }
export const emit = (e: GameEvent) => { for (const f of subs) f(e) }

/** 主线委托注入公告板（story.ts 注册） */
export const hooks = {
  storyContracts: (_island: string): Contract[] => { void _island; return [] },
}

/** 夜间：19:30 – 5:00 */
export const isNight = (tod: number) => tod >= 19.5 || tod < 5
