/**
 * 煤与水：锅炉燃煤产生蒸汽，蒸汽既用于加热气囊（浮力）也驱动螺旋桨。
 * 正常巡航（压力 ~55%、三档左右）满舱约可航行 6~7 分钟（v1.1 降低约 20% 消耗）。
 */
export const FUEL = {
  /** 怠速燃煤（每秒，占满舱比例） */
  coalIdle: 0.0006,
  /** 压力项：pressure × coalPress */
  coalPress: 0.0017,
  /** 推进项：|桨速| × coalProp */
  coalProp: 0.0013,
  waterIdle: 0.0003,
  waterPress: 0.0016,
  waterProp: 0.0009,
  /** 停靠补给速率（每秒） */
  refill: 0.12,
  /** 低量警告阈值 */
  low: 0.2,
  /** 缺水时锅炉压力上限 */
  noWaterCap: 0.34,
  /** 断煤时压力衰减速率（每秒） */
  noCoalDecay: 0.014,
}

export function coalRate(pressure: number, prop: number) {
  return FUEL.coalIdle + pressure * FUEL.coalPress + Math.abs(prop) * FUEL.coalProp
}
export function waterRate(pressure: number, prop: number) {
  return FUEL.waterIdle + pressure * FUEL.waterPress + Math.abs(prop) * FUEL.waterProp
}
