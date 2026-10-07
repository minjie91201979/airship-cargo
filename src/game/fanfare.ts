import { create } from 'zustand'

/** 金色提示条：主线目标进度 / 完成、章节完成、成就解锁 */
export type FanKind = 'obj' | 'done' | 'chapter' | 'achv'
export type Fan = { id: number; kind: FanKind; icon: string; title: string; text: string }

let fid = 0
export const useFanfare = create<{ list: Fan[] }>(() => ({ list: [] }))

export function fanfare(kind: FanKind, icon: string, title: string, text: string, ms = 5200) {
  const id = ++fid
  useFanfare.setState((s) => ({ list: [...s.list.slice(-3), { id, kind, icon, title, text }] }))
  setTimeout(() => useFanfare.setState((s) => ({ list: s.list.filter((f) => f.id !== id) })), ms)
}
