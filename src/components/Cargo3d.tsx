import { useMemo } from 'react'
import * as THREE from 'three'
import { useEco, type Kind } from '../game/economy'

/** 吊舱两舷货架上的货箱：按类型配色，尺寸随重量变化，从追尾视角也看得清 */
const COLORS: Record<Kind, [string, string]> = {
  normal: ['#c08a4a', '#5a3a1e'],
  fragile: ['#e8f2f8', '#3f8fd0'],
  urgent: ['#d8442e', '#ffd166'],
  heavy: ['#6a645c', '#2a2622'],
}

export function CargoCrates({ halfW, big }: { halfW: number; big: boolean }) {
  const cargo = useEco((s) => s.cargo)
  const mats = useMemo(() => {
    const o = {} as Record<Kind, [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>
    for (const k of Object.keys(COLORS) as Kind[]) o[k] = [
      new THREE.MeshStandardMaterial({ color: COLORS[k][0], roughness: 0.75, metalness: k === 'heavy' ? 0.5 : 0, emissive: COLORS[k][0], emissiveIntensity: 0.12 }),
      new THREE.MeshStandardMaterial({ color: COLORS[k][1], roughness: 0.6, metalness: k === 'heavy' ? 0.6 : 0.2 }),
    ]
    return o
  }, [])
  const rope = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2c1e', roughness: 1 }), [])
  // 货架位置：左右舷 × 前后 × 上下两层
  const rackX = halfW + (big ? 1.15 : 1.0)
  const zs = big ? [-0.4, -2.0, -3.6] : [-1.0, -3.0]
  const slots: [number, number, number][] = []
  for (let layer = 0; layer < 2; layer++) for (const z of zs) for (const sx of [-1, 1]) slots.push([sx, z, layer])
  const stackH: Record<string, number> = {}
  return (
    <group>
      {cargo.map((c, i) => {
        const [sx, z, layer] = slots[i % slots.length]
        const s = Math.min(big ? 1.75 : 1.6, 1.05 + c.weight * 0.12)
        const h = c.kind === 'heavy' ? s * 0.8 : s * 0.9
        const key = `${sx}${z}`
        const y0 = layer ? stackH[key] ?? 0 : 0
        stackH[key] = y0 + h
        const [mA, mB] = mats[c.kind]
        return (
          <group key={c.id} position={[sx * rackX, y0 + h / 2, z]} rotation-y={((i % 3) - 1) * 0.08}>
            <mesh material={mA} castShadow><boxGeometry args={[s, h, s * 1.15]} /></mesh>
            <mesh material={mB}><boxGeometry args={[s * 1.03, h * 0.16, s * 1.18]} /></mesh>
            <mesh material={mB}><boxGeometry args={[s * 0.16, h * 1.02, s * 1.18]} /></mesh>
            {c.kind === 'fragile' && <mesh material={mB} position={[sx * s * 0.52, 0, 0]}><boxGeometry args={[0.02, h * 0.5, s * 0.5]} /></mesh>}
            {/* 绑带 */}
            <mesh material={rope} position={[0, 0, s * 0.3]}><boxGeometry args={[s * 1.05, h * 1.04, 0.06]} /></mesh>
          </group>
        )
      })}
    </group>
  )
}
