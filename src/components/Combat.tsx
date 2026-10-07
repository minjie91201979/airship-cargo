import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { arms, flares, foes, npc, particles, shots, FOE_DEF, type Foe, type FoeKind } from '../game/combat'
import { ship } from '../game/flight'
import { useEco } from '../game/economy'
import { env } from '../game/env'
import { qcfg } from '../game/settings'
import { PM } from './Hazards'

/** v1.2 战斗渲染：敌船（空贼 / 通缉犯 / 小艇 / 黑帆号）、护航商船、弹道曳光、爆炸粒子、鱼叉钢缆、照明弹、玩家武器 */
export function Combat() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => <FoeShip key={`r${i}`} group={['raider', 'named']} slot={i} />)}
      {[0, 1, 2, 3, 4].map((i) => <FoeShip key={`s${i}`} group={['skiff']} slot={i} />)}
      <FoeShip group={['boss']} slot={0} />
      <NpcShip />
      <Projectiles />
      <Particles />
      <Flares />
      <Cable />
      <PlayerArms />
    </>
  )
}

const BM = {
  hull: new THREE.MeshStandardMaterial({ color: '#16131a', roughness: 0.7, flatShading: true }),
  red: new THREE.MeshStandardMaterial({ color: '#8f1d16', roughness: 0.6, flatShading: true, emissive: '#2a0402' }),
  sail: new THREE.MeshStandardMaterial({ color: '#7d1712', roughness: 1, side: THREE.DoubleSide }),
  gold: new THREE.MeshStandardMaterial({ color: '#a8822e', metalness: 0.7, roughness: 0.35, flatShading: true }),
  glow: new THREE.MeshBasicMaterial({ color: '#ff5a1e', toneMapped: false }),
  named: new THREE.MeshStandardMaterial({ color: '#b03a1a', roughness: 0.6, flatShading: true }),
}

/** 空贼船体（与 hazards 的随机空贼同款），boss 变体加装侧舷炮与战帆 */
function PirateHull({ variant }: { variant: 'raider' | 'skiff' | 'boss' }) {
  const env_ = variant === 'boss' ? BM.hull : PM.env
  return (
    <>
      <mesh material={env_} scale={[4, 4, 11.5]} castShadow><sphereGeometry args={[1, 14, 9]} /></mesh>
      {[-6, 0, 6].map((z) => <mesh key={z} material={variant === 'boss' ? BM.red : PM.stripe} position={[0, 0, z]}><torusGeometry args={[4 * Math.sqrt(1 - (z / 11.5) ** 2) + 0.05, 0.25, 5, 22]} /></mesh>)}
      {[0, 1, 2, 3].map((i) => <mesh key={i} material={variant === 'boss' ? BM.red : PM.stripe} position={[Math.cos((i * Math.PI) / 2) * 3, Math.sin((i * Math.PI) / 2) * 3, -9.5]} rotation-z={(i * Math.PI) / 2}><boxGeometry args={[0.2, 3.6, 3.4]} /></mesh>)}
      <group position={[0, -7.4, 0]}>
        <mesh material={PM.wood} castShadow><boxGeometry args={[variant === 'boss' ? 3.4 : 2.6, 1.5, 9.5]} /></mesh>
        <mesh material={PM.iron} position={[0, 0.2, 5.4]} rotation-x={Math.PI / 2}><coneGeometry args={[1.0, 2.2, 4]} /></mesh>
        <mesh material={PM.wood} position={[0, 3.2, 1]}><cylinderGeometry args={[0.1, 0.12, 5.6, 5]} /></mesh>
        <mesh material={variant === 'boss' ? BM.sail : PM.sail} position={[0.05, 3.4, -0.4]} rotation-y={Math.PI / 2}><shapeGeometry args={[new THREE.Shape([new THREE.Vector2(-1.2, -2.3), new THREE.Vector2(2.6, -2.3), new THREE.Vector2(-1.2, 2.6)])]} /></mesh>
        {[-1, 1].map((sx) => <mesh key={sx} material={PM.lamp} position={[sx * 1.4, 0.3, 3.5]}><sphereGeometry args={[0.22, 6, 4]} /></mesh>)}
        <group position={[0, 0, -5.4]} name="prop">
          {[0, 1, 2].map((i) => <mesh key={i} material={PM.iron} rotation-z={(i * Math.PI * 2) / 3}><boxGeometry args={[0.35, 3.2, 0.08]} /></mesh>)}
        </group>
        {variant === 'boss' && <>
          {/* 侧舷炮列 */}
          {[-1, 1].map((sx) => [-3.2, -1.1, 1.1, 3.2].map((z) => (
            <group key={`${sx}${z}`} position={[sx * 1.75, -0.1, z]}>
              <mesh material={BM.gold} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.16, 0.2, 0.9, 6]} /></mesh>
              <mesh material={BM.glow} position={[sx * 0.48, 0, 0]}><sphereGeometry args={[0.1, 5, 4]} /></mesh>
            </group>
          )))}
          {/* 第二桅与战帆 */}
          <mesh material={PM.wood} position={[0, 3.6, -3]}><cylinderGeometry args={[0.1, 0.12, 6.4, 5]} /></mesh>
          <mesh material={BM.sail} position={[0, 4.2, -3]}><boxGeometry args={[0.05, 3.6, 2.8]} /></mesh>
          <mesh material={BM.gold} position={[0, 0.85, 0]}><boxGeometry args={[3.5, 0.15, 9.6]} /></mesh>
        </>}
      </group>
      {[-3, 3].map((z) => [-1, 1].map((sx) => <mesh key={`${z}${sx}`} material={PM.rope} position={[sx * 1.4, -5.2, z]} rotation-z={sx * -0.3}><cylinderGeometry args={[0.04, 0.04, 3.6, 3]} /></mesh>))}
    </>
  )
}

function FoeShip({ group, slot }: { group: FoeKind[]; slot: number }) {
  const g = useRef<THREE.Group>(null!)
  const named = useRef<THREE.Mesh>(null!)
  const flash = useRef<THREE.Mesh>(null!)
  const variant = group[0] === 'boss' ? 'boss' : group[0] === 'skiff' ? 'skiff' : 'raider'
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useFrame(({ clock }) => {
    let f: Foe | null = null, n = 0
    for (const x of foes) if (group.includes(x.kind)) { if (n === slot) { f = x; break } n++ }
    g.current.visible = !!f
    if (!f) return
    const t = clock.elapsedTime
    const sc = FOE_DEF[f.kind].scale
    g.current.position.copy(f.pos)
    g.current.position.y += Math.sin(t * 0.8 + f.id) * 0.5 * sc
    const dd = f.dead
    g.current.rotation.set(Math.sin(t * 0.6 + f.id) * 0.03 + dd * 0.08, f.yaw, Math.sin(t * 0.5) * 0.05 + dd * 0.16 + (f.ramT > 0 ? Math.sin(t * 9) * 0.03 : 0))
    g.current.scale.setScalar(sc)
    if (named.current) named.current.visible = f.kind === 'named'
    const prop = g.current.getObjectByName('prop')
    if (prop) prop.rotation.z = t * 14
    flashMat.opacity = f.flash * 0.35
    flash.current.visible = f.flash > 0.02
  })
  return (
    <group ref={g} visible={false}>
      <PirateHull variant={variant} />
      {variant === 'raider' && <mesh ref={named} material={BM.named} scale={[4.06, 4.06, 11.6]} visible={false}><sphereGeometry args={[1, 14, 9, 0, Math.PI * 2, 0, 0.9]} /></mesh>}
      <mesh ref={flash} material={flashMat} scale={[4.6, 4.6, 12.5]}><sphereGeometry args={[1, 10, 7]} /></mesh>
    </group>
  )
}

/** 护航商船：奶白气囊、蓝色蒙皮条、商会旗 */
const NM = {
  env: new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.8, flatShading: true }),
  band: new THREE.MeshStandardMaterial({ color: '#2f5f8f', roughness: 0.7, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9, flatShading: true }),
  flag: new THREE.MeshStandardMaterial({ color: '#2f8f5a', side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: '#7fd0ff', toneMapped: false }),
}
function NpcShip() {
  const g = useRef<THREE.Group>(null!)
  const prop = useRef<THREE.Group>(null!)
  const fl = useRef<THREE.Mesh>(null!)
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff7040', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  useFrame(({ clock }, dt) => {
    g.current.visible = npc.active
    if (!npc.active) return
    const t = clock.elapsedTime
    g.current.position.copy(npc.pos)
    g.current.position.y += Math.sin(t * 0.7) * 0.5
    g.current.rotation.set(0, npc.yaw, Math.sin(t * 0.4) * 0.03)
    prop.current.rotation.z += Math.min(dt, 0.1) * 10
    flashMat.opacity = npc.flash * 0.4
    fl.current.visible = npc.flash > 0.02
  })
  return (
    <group ref={g} visible={false} scale={1.15}>
      <mesh material={NM.env} scale={[4.6, 4.4, 13]} castShadow><sphereGeometry args={[1, 16, 10]} /></mesh>
      {[-7, -2.5, 2.5, 7].map((z) => <mesh key={z} material={NM.band} position={[0, 0, z]}><torusGeometry args={[4.5 * Math.sqrt(1 - (z / 13) ** 2) + 0.05, 0.22, 5, 24]} /></mesh>)}
      {[0, 1, 2, 3].map((i) => <mesh key={i} material={NM.band} position={[Math.cos((i * Math.PI) / 2) * 3.2, Math.sin((i * Math.PI) / 2) * 3.2, -11]} rotation-z={(i * Math.PI) / 2}><boxGeometry args={[0.2, 3.4, 3.6]} /></mesh>)}
      <group position={[0, -7.6, 0]}>
        <mesh material={NM.wood} castShadow><boxGeometry args={[3.4, 2.2, 10]} /></mesh>
        {[-3, 0, 3].map((z) => <mesh key={z} material={NM.band} position={[0, -1.4, z]}><boxGeometry args={[2.6, 1.2, 2.2]} /></mesh>)}
        <mesh material={NM.lamp} position={[0, 0.4, 5.1]}><sphereGeometry args={[0.3, 6, 4]} /></mesh>
        <group ref={prop} position={[0, 0, -5.4]}>{[0, 1, 2].map((i) => <mesh key={i} material={NM.wood} rotation-z={(i * Math.PI * 2) / 3}><boxGeometry args={[0.35, 3.4, 0.08]} /></mesh>)}</group>
        <mesh material={NM.wood} position={[0, 2.2, -3.8]}><cylinderGeometry args={[0.06, 0.06, 3, 4]} /></mesh>
        <mesh material={NM.flag} position={[0, 3.1, -4.6]} rotation-y={Math.PI / 2}><planeGeometry args={[1.6, 1]} /></mesh>
      </group>
      <mesh ref={fl} material={flashMat} scale={[5.2, 5, 14]}><sphereGeometry args={[1, 10, 7]} /></mesh>
    </group>
  )
}

const MAXS = 220
function Projectiles() {
  const tr = useRef<THREE.InstancedMesh>(null!)
  const ball = useRef<THREE.InstancedMesh>(null!)
  const trail = useRef<THREE.InstancedMesh>(null!)
  const harp = useRef<THREE.Mesh>(null!)
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const sph = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])
  const trMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [])
  const ballMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false, fog: false }), [])
  const trailMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff5a1e', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const fz = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const d = useMemo(() => new THREE.Vector3(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    let a = 0, b = 0
    harp.current.visible = false
    for (const s of shots) {
      if (s.t < 0) continue
      d.copy(s.vel).normalize()
      q.setFromUnitVectors(fz, d)
      if (s.kind === 0) {
        p.copy(s.pos).addScaledVector(d, -3)
        tr.current.setMatrixAt(a++, m.compose(p, q, sc.set(0.22, 0.22, 7)))
      } else if (s.kind === 1) {
        ball.current.setMatrixAt(b, m.compose(s.pos, q, sc.set(0.75, 0.75, 0.75)))
        p.copy(s.pos).addScaledVector(d, -3.2)
        trail.current.setMatrixAt(b++, m.compose(p, q, sc.set(0.5, 0.5, 6)))
      } else {
        harp.current.visible = true
        harp.current.position.copy(s.pos)
        harp.current.quaternion.copy(q)
      }
    }
    for (let i = a; i < MAXS; i++) tr.current.setMatrixAt(i, zero)
    for (let i = b; i < MAXS; i++) { ball.current.setMatrixAt(i, zero); trail.current.setMatrixAt(i, zero) }
    tr.current.instanceMatrix.needsUpdate = ball.current.instanceMatrix.needsUpdate = trail.current.instanceMatrix.needsUpdate = true
    tr.current.visible = a > 0
    ball.current.visible = trail.current.visible = b > 0
  })
  return (
    <>
      <instancedMesh ref={tr} args={[box, trMat, MAXS]} frustumCulled={false} />
      <instancedMesh ref={ball} args={[sph, ballMat, MAXS]} frustumCulled={false} />
      <instancedMesh ref={trail} args={[box, trailMat, MAXS]} frustumCulled={false} />
      <mesh ref={harp} material={PM.iron} visible={false} rotation-x={Math.PI / 2}><coneGeometry args={[0.35, 2.4, 5]} /></mesh>
    </>
  )
}

const MAXP = 360
function Particles() {
  const fire = useRef<THREE.InstancedMesh>(null!)
  const smoke = useRef<THREE.InstancedMesh>(null!)
  const spark = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  const fireMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffa040', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const smokeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3532', transparent: true, opacity: 0.55, depthWrite: false, roughness: 1, flatShading: true }), [])
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff0b0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useFrame(() => {
    let a = 0, b = 0, c = 0
    for (const p of particles) {
      const k = p.t / p.life
      if (p.kind === 0) fire.current.setMatrixAt(a++, m.compose(p.pos, q, sc.setScalar(p.size * (1 - k * 0.8))))
      else if (p.kind === 1) smoke.current.setMatrixAt(b++, m.compose(p.pos, q, sc.setScalar(p.size * (0.4 + k * 1.2))))
      else spark.current.setMatrixAt(c++, m.compose(p.pos, q, sc.setScalar(p.size * (1 - k))))
    }
    for (let i = a; i < MAXP; i++) fire.current.setMatrixAt(i, zero)
    for (let i = b; i < MAXP; i++) smoke.current.setMatrixAt(i, zero)
    for (let i = c; i < MAXP; i++) spark.current.setMatrixAt(i, zero)
    fire.current.instanceMatrix.needsUpdate = smoke.current.instanceMatrix.needsUpdate = spark.current.instanceMatrix.needsUpdate = true
    fire.current.visible = a > 0; smoke.current.visible = b > 0; spark.current.visible = c > 0
  })
  return (
    <>
      <instancedMesh ref={smoke} args={[geo, smokeMat, MAXP]} frustumCulled={false} />
      <instancedMesh ref={fire} args={[geo, fireMat, MAXP]} frustumCulled={false} />
      <instancedMesh ref={spark} args={[geo, sparkMat, MAXP]} frustumCulled={false} />
    </>
  )
}

function Flares() {
  const glow = useRef<THREE.InstancedMesh>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const geo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd0f0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (let i = 0; i < 4; i++) {
      const f = flares[i]
      if (!f) { glow.current.setMatrixAt(i, zero); continue }
      const fade = Math.min(1, (f.life - f.t) / 1.5)
      glow.current.setMatrixAt(i, m.compose(f.pos, q, sc.setScalar((1.6 + Math.sin(t * 30 + i) * 0.4) * fade)))
    }
    glow.current.instanceMatrix.needsUpdate = true
    glow.current.visible = flares.length > 0
    const last = flares[flares.length - 1]
    light.current.visible = !!last && qcfg().lights
    if (last) { light.current.position.copy(last.pos); light.current.intensity = (3000 + env.night * 9000) * Math.min(1, (last.life - last.t) / 1.5) * (0.85 + Math.random() * 0.3) }
  })
  return (
    <>
      <instancedMesh ref={glow} args={[geo, mat, 4]} frustumCulled={false} />
      <pointLight ref={light} color="#ffc8e8" distance={260} decay={1.6} visible={false} />
    </>
  )
}

/** 鱼叉钢缆：飞行中连到鱼叉头，命中后连到敌船 */
function Cable() {
  const ref = useRef<THREE.Mesh>(null!)
  const a = useMemo(() => new THREE.Vector3(), [])
  const d = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  useFrame(() => {
    const end = arms.hook ? arms.hook.pos : arms.harp ? arms.harp.pos : null
    ref.current.visible = !!end
    if (!end) return
    const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw)
    a.set(ship.pos.x + 1.7 * c + 3 * s, ship.pos.y - 8.6, ship.pos.z - 1.7 * s + 3 * c)
    d.subVectors(end, a)
    if (arms.hook) d.y -= 6 * (arms.hook.kind === 'boss' ? 2.5 : arms.hook.kind === 'skiff' ? 0.5 : 1)
    ref.current.position.copy(a).addScaledVector(d, 0.5)
    ref.current.quaternion.setFromUnitVectors(up, d.clone().normalize())
    ref.current.scale.set(1, d.length(), 1)
  })
  return <mesh ref={ref} material={PM.rope} visible={false}><cylinderGeometry args={[0.09, 0.09, 1, 4]} /></mesh>
}

/** 玩家武器外观：吊舱下方的黄铜机炮（随瞄准转动）、右舷鱼叉炮、尾部照明弹管 */
const AM = {
  brass: new THREE.MeshStandardMaterial({ color: '#c9973e', metalness: 0.75, roughness: 0.32, flatShading: true }),
  iron: new THREE.MeshStandardMaterial({ color: '#2c2a28', metalness: 0.6, roughness: 0.45, flatShading: true }),
  flash: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
}
function PlayerArms() {
  const w = useEco((s) => s.weapons) ?? { gun: 0, harpoon: 0, flare: 0 }
  const root = useRef<THREE.Group>(null!)
  const turret = useRef<THREE.Group>(null!)
  const flash = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    root.current.position.copy(ship.pos)
    root.current.rotation.set(0, ship.yaw, 0)
    if (turret.current) {
      let dy = arms.lock ? Math.atan2(arms.lock.pos.x - ship.pos.x, arms.lock.pos.z - ship.pos.z) - ship.yaw : arms.aimYaw - ship.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      turret.current.rotation.set(-THREE.MathUtils.clamp(arms.aimPitch, -0.6, 0.5), dy, 0, 'YXZ')
    }
    if (flash.current) { flash.current.visible = arms.muzzle > 0.3; flash.current.scale.setScalar(0.5 + Math.random() * 0.5) }
  })
  return (
    <group ref={root}>
      {w.gun > 0 && (
        <group position={[0, -9.6, 4.6]}>
          <mesh material={AM.iron}><cylinderGeometry args={[0.45, 0.55, 0.5, 8]} /></mesh>
          <group ref={turret}>
            <mesh material={AM.brass} position={[0, -0.3, 0]}><sphereGeometry args={[0.42, 8, 6]} /></mesh>
            {(w.gun >= 2 ? [-0.18, 0.18] : [0]).map((x) => <mesh key={x} material={AM.brass} position={[x, -0.3, 1.0]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.09, 0.12, 1.6, 6]} /></mesh>)}
            <mesh ref={flash} material={AM.flash} position={[0, -0.3, 2.0]} visible={false}><sphereGeometry args={[0.45, 6, 5]} /></mesh>
          </group>
        </group>
      )}
      {w.harpoon > 0 && (
        <group position={[1.7, -8.6, 3]}>
          <mesh material={AM.iron} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.2, 0.26, 1.8, 6]} /></mesh>
          <mesh material={AM.brass} position={[0, 0, -0.9]}><cylinderGeometry args={[0.35, 0.35, 0.4, 8]} /></mesh>
          {!arms.hook && <mesh material={AM.iron} position={[0, 0, 1.1]} rotation-x={Math.PI / 2}><coneGeometry args={[0.22, 0.7, 5]} /></mesh>}
        </group>
      )}
      {w.flare > 0 && (
        <group position={[0, -8.4, -5.2]}>
          {[-0.3, 0, 0.3].map((x) => <mesh key={x} material={AM.brass} position={[x, 0, 0]} rotation-x={-0.6}><cylinderGeometry args={[0.1, 0.1, 0.8, 6]} /></mesh>)}
        </group>
      )}
    </group>
  )
}
