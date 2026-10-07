import { create } from 'zustand'

export type Screen = 'menu' | 'play' | 'paused' | 'port' | 'photo'
export type View = 'chase' | 'bridge' | 'far'
export const VIEW_NAMES: Record<View, string> = { chase: '追尾视角', bridge: '舰桥视角', far: '远景视角' }
export type MapMode = 'near' | 'full' | 'world' | 'off'
export const MAP_NAMES: Record<MapMode, string> = { near: '小地图：近景', full: '小地图：本区全图', world: '小地图：世界总图（云港群岛 + 霜原群岛）', off: '小地图：关闭' }
const VIEWS: View[] = ['chase', 'bridge', 'far']
export type PortTab = 'board' | 'hold' | 'supply' | 'shop' | 'yard'
export type Sheet = 'achv' | 'log' | 'settings' | null

type State = {
  screen: Screen
  view: View
  runId: number
  portTab: PortTab
  begin: () => void
  pause: () => void
  resume: () => void
  togglePause: () => void
  toMenu: () => void
  openPort: (tab?: PortTab) => void
  closePort: () => void
  setPortTab: (t: PortTab) => void
  cycleView: () => void
  mapMode: MapMode
  cycleMap: () => void
  /** 航运日志 / 成就 弹窗 */
  sheet: Sheet
  openSheet: (s: Sheet) => void
}

export const useGame = create<State>((set, get) => ({
  screen: 'menu',
  view: 'chase',
  runId: 0,
  portTab: 'board',
  begin: () => set((s) => ({ screen: 'play', runId: s.runId + 1 })),
  pause: () => get().screen === 'play' && set({ screen: 'paused' }),
  resume: () => get().screen === 'paused' && set({ screen: 'play' }),
  togglePause: () => {
    const s = get().screen
    if (get().sheet) { set({ sheet: null }); return }
    if (s === 'play') set({ screen: 'paused' })
    else if (s === 'paused' || s === 'port') set({ screen: 'play' })
  },
  toMenu: () => set({ screen: 'menu', sheet: null }),
  openPort: (tab) => set((s) => ({ screen: 'port', portTab: tab ?? s.portTab })),
  closePort: () => get().screen === 'port' && set({ screen: 'play' }),
  setPortTab: (t) => set({ portTab: t }),
  cycleView: () => set((s) => ({ view: VIEWS[(VIEWS.indexOf(s.view) + 1) % VIEWS.length] })),
  mapMode: 'near',
  cycleMap: () => set((s) => ({ mapMode: s.mapMode === 'near' ? 'full' : s.mapMode === 'full' ? 'world' : s.mapMode === 'world' ? 'off' : 'near' })),
  sheet: null,
  openSheet: (sheet) => set({ sheet }),
}))
