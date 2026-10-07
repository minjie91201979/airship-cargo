import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { dockOf, useEco } from '../game/economy'

/** 交货目的地信标：栈桥上的金色光柱 + 旋转菱形 */
export function Beacons() {
  const cargo = useEco((s) => s.cargo)
  const dests = [...new Set(cargo.map((c) => c.to))]
  const mats = useMemo(() => ({
    pillar: new THREE.MeshBasicMaterial({ color: '#ffb52e', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.45, depthWrite: false, fog: false, toneMapped: false }),
    gem: new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ff9a20', emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 }),
    ring: new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  }), [])
  return <>{dests.map((id) => <Beacon key={id} id={id} mats={mats} />)}</>
}

function Beacon({ id, mats }: { id: string; mats: Record<'pillar' | 'core' | 'gem' | 'ring', THREE.Material> }) {
  const d = dockOf(id)
  const gem = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    gem.current.rotation.y = t * 1.5
    gem.current.position.y = 26 + Math.sin(t * 2) * 1.5
    const k = (t * 0.6) % 1
    ring.current.scale.setScalar(4 + k * 18)
    ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)
  })
  return (
    <group position={[d.x, d.y - 8, d.z]}>
      <mesh material={mats.pillar} position={[0, 160, 0]}><cylinderGeometry args={[3.2, 3.2, 320, 16, 1, true]} /></mesh>
      <mesh material={mats.core} position={[0, 160, 0]}><cylinderGeometry args={[0.9, 0.9, 320, 8, 1, true]} /></mesh>
      <group ref={gem}>
        <mesh material={mats.gem} scale={[2.2, 3.4, 2.2]}><octahedronGeometry args={[1, 0]} /></mesh>
      </group>
      <mesh ref={ring} material={mats.ring.clone()} rotation-x={-Math.PI / 2} position={[0, 1, 0]}><ringGeometry args={[0.9, 1, 40]} /></mesh>
    </group>
  )
}
