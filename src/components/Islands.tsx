import { useEco } from '../game/economy'
import { qcfg } from '../game/settings'
import { useFrame } from '@react-three/fiber'
import { env } from '../game/env'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ISLANDS, PIER_DECK, PIER_W, PORT, pierZ0, pierZ1, rotY, type Feature, type IslandDef } from '../game/world'
import { hash3, rng } from '../game/rng'

const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra })
const M = {
  rock: std('#8d6e58', { roughness: 0.95 }),
  rockDark: std('#5f4a43', { roughness: 1 }),
  dirt: std('#a2774f', { roughness: 1 }),
  grass: std('#86a554', { roughness: 1 }),
  wood: std('#7a5233'),
  woodDark: std('#4f3422'),
  brass: std('#d1a04f', { metalness: 0.35, roughness: 0.4 }),
  copper: std('#b8693a', { metalness: 0.3, roughness: 0.5 }),
  iron: std('#3d3a3a', { metalness: 0.6, roughness: 0.5 }),
  stone: std('#b9ab98', { roughness: 1 }),
  brick: std('#8f4a32'),
  white: std('#f1e8d8', { roughness: 0.8 }),
  red: std('#b0432f', { roughness: 0.8 }),
  coal: std('#2b2826', { roughness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffbf5a', emissiveIntensity: 2.2, fog: false }),
  ember: new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff4a10', emissiveIntensity: 2.4, flatShading: true }),
  leaf: std('#5f8a3e', { roughness: 1 }),
  leaf2: std('#a39a3a', { roughness: 1 }),
  pine: std('#3f6a3e', { roughness: 1 }),
  deadwood: std('#3a2e2a', { roughness: 1 }),
  canvas: std('#e8dcc0', { roughness: 1, side: THREE.DoubleSide }),
  water: new THREE.MeshStandardMaterial({ color: '#6fb4d8', roughness: 0.15, metalness: 0.1, emissive: '#2a5a7a', emissiveIntensity: 0.3 }),
  reed: std('#c9b062', { roughness: 1 }),
  fruit: new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#a03a00', emissiveIntensity: 0.3, roughness: 0.6 }),
  smoke: new THREE.MeshStandardMaterial({ color: '#8a8480', transparent: true, opacity: 0.38, depthWrite: false, roughness: 1, flatShading: true }),
  // v1.3 霜原
  snow: std('#f4f7fb', { roughness: 0.85 }),
  snowDirt: std('#c9d3de', { roughness: 1 }),
  pineDark: std('#2c4a3e', { roughness: 1 }),
  ice: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#4ab8ff', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true }),
  crystal: new THREE.MeshStandardMaterial({ color: '#a8f0ff', emissive: '#38d0ff', emissiveIntensity: 1.6, roughness: 0.1, flatShading: true }),
  icicle: new THREE.MeshStandardMaterial({ color: '#dff4ff', emissive: '#6ab0d8', emissiveIntensity: 0.25, roughness: 0.2, transparent: true, opacity: 0.9, flatShading: true }),
  spring: new THREE.MeshStandardMaterial({ color: '#58d8c8', emissive: '#1a8a80', emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.1 }),
  steam: new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false, roughness: 1, flatShading: true }),
  fur: std('#8a6a4a', { roughness: 1 }),
  antler: std('#d8c8a8', { roughness: 1 }),
  fire: new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff6a10', emissiveIntensity: 3, flatShading: true }),
}

/** 让几何体顶点按位置哈希抖动（接缝一致），得到低多边形岩石质感 */
function jitter(g: THREE.BufferGeometry, amp: number, seed: number, keepTopY?: number) {
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const top = keepTopY !== undefined && y > keepTopY - 0.01
    const k = top ? 0.15 : 1
    p.setXYZ(i, x + hash3(x, y, z, seed) * amp * k, y + (top ? 0 : hash3(x, y, z, seed + 1) * amp * 0.8), z + hash3(x, y, z, seed + 2) * amp * k)
  }
  g.computeVertexNormals()
  return g
}

function rockGeo(R: number, depth: number, seed: number, radial = 16, rings = 6) {
  const g = new THREE.ConeGeometry(R, depth, radial, rings, true)
  g.rotateX(Math.PI)
  g.translate(0, -depth / 2, 0)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const t = 1 + y / depth
    const bulge = Math.pow(t, 0.75) / Math.max(t, 1e-4)
    if (t > 1e-4) p.setXYZ(i, p.getX(i) * bulge, y, p.getZ(i) * bulge)
  }
  return jitter(g, R * 0.09, seed, 0)
}

/** 浮空岛岩体 + 草皮 + 悬挂碎石 */
function Rock({ isl }: { isl: IslandDef }) {
  const { main, inner, grass, dirt, bits, grassMat, rockMat } = useMemo(() => {
    const r = rng(isl.seed)
    const bits: { pos: [number, number, number]; geo: THREE.BufferGeometry }[] = []
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = isl.R * (0.25 + r() * 0.45)
      const s = isl.R * (0.12 + r() * 0.12)
      bits.push({ pos: [Math.cos(a) * d, -isl.depth * (0.25 + r() * 0.35), Math.sin(a) * d], geo: rockGeo(s, s * 2.4, isl.seed + 10 + i, 7, 2) })
    }
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2, d = isl.R * (1.05 + r() * 0.3)
      const s = 1.5 + r() * isl.R * 0.05
      bits.push({ pos: [Math.cos(a) * d, -6 - r() * isl.depth * 0.5, Math.sin(a) * d], geo: jitter(new THREE.DodecahedronGeometry(s, 0), s * 0.3, isl.seed + 40 + i) })
    }
    return {
      main: rockGeo(isl.R, isl.depth, isl.seed),
      inner: rockGeo(isl.R * 0.62, isl.depth * 1.25, isl.seed + 3, 11, 5),
      grass: jitter(new THREE.CylinderGeometry(isl.R * 1.01, isl.R * 0.99, 2.2, 22, 1), isl.R * 0.02, isl.seed + 5, 1.1),
      dirt: jitter(new THREE.CylinderGeometry(isl.R * 0.99, isl.R * 0.93, 5, 20, 1), isl.R * 0.03, isl.seed + 6, 2.5),
      bits,
      grassMat: isl.snow ? M.snow : isl.grass ? std(isl.grass, { roughness: 1 }) : M.grass,
      rockMat: isl.rock ? std(isl.rock, { roughness: 0.95 }) : M.rock,
    }
  }, [isl])
  const icicles = useMemo(() => {
    if (!isl.snow) return [] as [number, number, number, number][]
    const r = rng(isl.seed + 77)
    const out: [number, number, number, number][] = []
    const n = Math.round(isl.R * 0.9)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.05
      out.push([Math.cos(a) * isl.R * 0.985, -5.2, Math.sin(a) * isl.R * 0.985, 1.5 + r() * 4.5])
    }
    return out
  }, [isl])
  return (
    <group>
      <mesh geometry={main} material={rockMat} position={[0, -3, 0]} castShadow receiveShadow />
      <mesh geometry={inner} material={M.rockDark} position={[isl.R * 0.12, -4, -isl.R * 0.1]} castShadow />
      <mesh geometry={dirt} material={isl.snow ? M.snowDirt : M.dirt} position={[0, -3.2, 0]} receiveShadow />
      {icicles.length > 0 && <Icicles list={icicles} />}
      <mesh geometry={grass} material={grassMat} position={[0, -1.1, 0]} receiveShadow />
      {bits.map((b, i) => <mesh key={i} geometry={b.geo} material={i < 5 ? M.rockDark : rockMat} position={b.pos} castShadow />)}
    </group>
  )
}

/** 岛缘冰锥（实例化） */
const icicleGeo = new THREE.ConeGeometry(0.55, 1, 5).rotateX(Math.PI).translate(0, -0.5, 0)
function Icicles({ list }: { list: [number, number, number, number][] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3()
    list.forEach(([x, y, z, l], i) => ref.current.setMatrixAt(i, m.compose(v.set(x, y, z), q, sc.set(1, l, 1))))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [list])
  return <instancedMesh ref={ref} args={[icicleGeo, M.icicle, list.length]} />
}

/** 实例化树木：0 松树 1 阔叶 2 黄叶 3 枯树 4 雪松（v1.3） */
type TreeSpec = { x: number; z: number; s: number; kind: number }
const G = {
  trunk: new THREE.CylinderGeometry(0.25, 0.4, 3, 5).translate(0, 1.5, 0),
  pine1: new THREE.ConeGeometry(2.2, 4, 7).translate(0, 4.2, 0),
  pine2: new THREE.ConeGeometry(1.6, 3.2, 7).translate(0, 6.2, 0),
  round: new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.4, 0),
  dead: new THREE.CylinderGeometry(0.12, 0.35, 5, 5).translate(0, 2.5, 0),
  branch: new THREE.BoxGeometry(2.4, 0.18, 0.18).translate(0.9, 3.4, 0),
  puff: new THREE.IcosahedronGeometry(1, 0),
  cap1: new THREE.ConeGeometry(1.5, 1.6, 7).translate(0, 5.6, 0),
  cap2: new THREE.ConeGeometry(1.0, 1.3, 7).translate(0, 7.3, 0),
  pine3: new THREE.ConeGeometry(2.6, 3.4, 7).translate(0, 3.1, 0),
}
function Trees({ trees }: { trees: TreeSpec[] }) {
  const groups = useMemo(() => {
    const by = (k: number[]) => trees.filter((t) => k.includes(t.kind))
    return [
      { geo: G.trunk, mat: M.woodDark, list: by([0, 1, 2, 4]) },
      { geo: G.pine3, mat: M.pineDark, list: by([4]) },
      { geo: G.pine1, mat: M.pineDark, list: by([4]) },
      { geo: G.pine2, mat: M.pineDark, list: by([4]) },
      { geo: G.cap1, mat: M.snow, list: by([4]) },
      { geo: G.cap2, mat: M.snow, list: by([4]) },
      { geo: G.pine1, mat: M.pine, list: by([0]) },
      { geo: G.pine2, mat: M.pine, list: by([0]) },
      { geo: G.round, mat: M.leaf, list: by([1]) },
      { geo: G.round, mat: M.leaf2, list: by([2]) },
      { geo: G.dead, mat: M.deadwood, list: by([3]) },
      { geo: G.branch, mat: M.deadwood, list: by([3]) },
    ].filter((g) => g.list.length)
  }, [trees])
  return <>{groups.map((g, i) => <Inst key={i} geo={g.geo} mat={g.mat} list={g.list} />)}</>
}
function Inst({ geo, mat, list }: { geo: THREE.BufferGeometry; mat: THREE.Material; list: TreeSpec[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    list.forEach((t, i) => {
      q.setFromEuler(e.set(0, (t.x * 7.3 + t.z * 3.1) % 6.28, 0))
      ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s, t.s)))
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [list])
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} castShadow />
}

/** 三角棱柱屋顶，顶点朝上，沿 x 轴延伸 */
function Roof({ w, d, color, y }: { w: number; d: number; color: string; y: number }) {
  const r = (d + 1.2) / 1.732
  return (
    <mesh position={[0, y + r * 0.5, 0]} rotation-z={Math.PI / 2} castShadow>
      <cylinderGeometry args={[r, r, w + 1.2, 3, 1, false, Math.PI / 2]} />
      <meshStandardMaterial color={color} flatShading metalness={0.3} roughness={0.6} />
    </mesh>
  )
}

function Building({ f }: { f: Extract<Feature, { k: 'warehouse' | 'house' }> }) {
  const { w, h, d } = f
  const big = f.k === 'warehouse'
  return (
    <group position={[f.x, 0, f.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={f.wall} flatShading roughness={0.9} />
      </mesh>
      <mesh material={M.brass} position={[0, h - 0.15, 0]}><boxGeometry args={[w + 0.4, 0.3, d + 0.4]} /></mesh>
      {big && <mesh material={M.brass} position={[0, h * 0.45, 0]}><boxGeometry args={[w + 0.2, 0.35, d + 0.2]} /></mesh>}
      <Roof w={w} d={d} color={f.roof} y={h} />
      <mesh material={M.woodDark} position={[0, h * 0.28, d / 2 + 0.05]}><boxGeometry args={[big ? w * 0.35 : 1.4, h * (big ? 0.56 : 0.5), 0.2]} /></mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} material={M.glow} position={[sx * w * 0.3, h * 0.65, d / 2 + 0.06]}><boxGeometry args={[big ? 1.4 : 0.9, big ? 1.1 : 0.8, 0.1]} /></mesh>
      ))}
      <mesh material={M.glow} position={[w / 2 + 0.06, h * 0.65, 0]}><boxGeometry args={[0.1, 1, 1.4]} /></mesh>
      {big && <>
        <mesh material={M.red} position={[w * 0.3, h + d * 0.4, -d * 0.2]} castShadow><boxGeometry args={[1.2, d * 0.5, 1.2]} /></mesh>
        <mesh material={M.iron} position={[w * 0.3, h + d * 0.65, -d * 0.2]}><boxGeometry args={[1.5, 0.3, 1.5]} /></mesh>
      </>}
    </group>
  )
}

function Crate({ pos, s = 1.4, c = '#9a6a3a' }: { pos: [number, number, number]; s?: number; c?: string }) {
  return (
    <mesh position={[pos[0], pos[1] + s / 2, pos[2]]} castShadow>
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color={c} flatShading roughness={0.9} />
    </mesh>
  )
}

function Lamp({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh material={M.iron} position={[0, 1.6, 0]}><cylinderGeometry args={[0.08, 0.12, 3.2, 5]} /></mesh>
      <mesh material={M.glow} position={[0, 3.35, 0]}><boxGeometry args={[0.45, 0.55, 0.45]} /></mesh>
      <mesh material={M.brass} position={[0, 3.75, 0]}><coneGeometry args={[0.4, 0.35, 4]} /></mesh>
    </group>
  )
}

/** 栈桥：木甲板、系泊桩、灯柱、货箱、支撑架（局部 +Z 方向伸出） */
function Pier({ isl }: { isl: IslandDef }) {
  const z0 = pierZ0(isl), z1 = pierZ1(isl)
  const len = z1 - z0
  const posts: number[] = []
  for (let z = z0 + 6; z <= z1; z += 7) posts.push(z)
  return (
    <group rotation-y={(isl.pier * Math.PI) / 180} position={[0, PIER_DECK, 0]}>
      <mesh material={M.wood} position={[0, -0.35, (z0 + z1) / 2]} receiveShadow castShadow><boxGeometry args={[PIER_W, 0.7, len]} /></mesh>
      {Array.from({ length: Math.floor(len / 2.2) }, (_, i) => (
        <mesh key={i} material={M.woodDark} position={[0, 0.01, z0 + 1 + i * 2.2]}><boxGeometry args={[PIER_W, 0.03, 0.12]} /></mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={sx} material={M.woodDark} position={[sx * (PIER_W / 2 - 0.4), -1.6, (z0 + z1) / 2]}><boxGeometry args={[0.5, 2, len]} /></mesh>
      ))}
      {posts.filter((_, i) => i % 2 === 1).map((z) => (
        <group key={z} position={[0, -2.2, z]}>
          <mesh material={M.woodDark} rotation-x={0.6} position={[0, -2.2, -2.2]}><boxGeometry args={[0.4, 0.4, 6]} /></mesh>
          <mesh material={M.glow} position={[0, -1.2, 0]}><sphereGeometry args={[0.35, 6, 4]} /></mesh>
        </group>
      ))}
      {posts.map((z) => [-1, 1].map((sx) => (
        <group key={`${z}${sx}`} position={[sx * (PIER_W / 2 - 0.35), 0, z]}>
          <mesh material={M.iron} position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.28, 0.34, 1.1, 8]} /></mesh>
          <mesh material={M.brass} position={[0, 1.15, 0]}><sphereGeometry args={[0.36, 8, 5]} /></mesh>
        </group>
      )))}
      {[z0 + 14, z0 + 32, z1 - 2].map((z) => <Lamp key={z} pos={[-PIER_W / 2 + 0.3, 0, z]} />)}
      <mesh material={M.copper} position={[0, 2.6, z1 - 0.5]}><boxGeometry args={[PIER_W + 1, 0.4, 0.4]} /></mesh>
      {[-1, 1].map((sx) => <mesh key={sx} material={M.woodDark} position={[sx * (PIER_W / 2 + 0.3), 1.3, z1 - 0.5]}><boxGeometry args={[0.4, 2.6, 0.4]} /></mesh>)}
      {/* 补给站：煤斗 + 水箱 */}
      <group position={[PIER_W / 2 - 1.2, 0, z0 + 22]}>
        <mesh material={M.coal} position={[0, 0.6, 0]} castShadow><boxGeometry args={[1.6, 1.2, 1.6]} /></mesh>
        <mesh material={M.copper} position={[0, 0.6, 2.2]} castShadow><cylinderGeometry args={[0.8, 0.8, 1.3, 10]} /></mesh>
      </group>
      <Crate pos={[-1.6, 0, z0 + 8]} />
      <Crate pos={[-1.5, 1.4, z0 + 8.2]} s={1.1} c="#b07a42" />
      <Crate pos={[1.6, 0, z0 + 12]} s={1.2} c="#7d5a3a" />
      {/* 岸上到栈桥的石板路 */}
      <mesh material={M.stone} position={[0, -PIER_DECK + 0.05, z0 - 6]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[5, 14]} /></mesh>
    </group>
  )
}

/** 灯塔：红白条纹塔身、黄铜回廊、旋转光束 */
const beamGeo = (() => {
  const g = new THREE.ConeGeometry(12, 170, 20, 1, true)
  g.translate(0, -85, 0)
  g.rotateZ(Math.PI / 2)
  return g
})()
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  uniforms: { uK: { value: 0.32 } },
  fragmentShader: `uniform float uK; varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * uK; gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * a, a); }`,
})
const lhLights = new Set<THREE.PointLight>()
/** 云港灯塔复明后的金色光束 */
const beamGoldMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  uniforms: { uK: { value: 0.6 } },
  fragmentShader: `uniform float uK; varying vec2 vUv; void main(){ float a = pow(vUv.y, 1.8) * uK; gl_FragColor = vec4(vec3(1.0, 0.8, 0.38) * a, a); }`,
})
const LM = {
  dark: new THREE.MeshStandardMaterial({ color: '#3a3a44', roughness: 0.3, metalness: 0.4, emissive: '#000000' }),
  gold: new THREE.MeshStandardMaterial({ color: '#fff0b0', emissive: '#ffb830', emissiveIntensity: 4, fog: false, toneMapped: false }),
}
const goldLights = new Set<THREE.PointLight>()
function Lighthouse({ x, z, h, r = 3.6, port = false }: { x: number; z: number; h: number; r?: number; port?: boolean }) {
  const beam = useRef<THREE.Group>(null!)
  const gear = useRef<THREE.Group>(null!)
  const restored = useEco((s) => s.story.ended)
  const lit = !port || restored
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    if (beam.current) beam.current.rotation.y += d * (port ? 0.95 : 0.7)
    if (gear.current) gear.current.rotation.z += d * 0.5
  })
  const bands = 5, segH = (h - 4) / bands, rTop = r * 0.58
  const k = r / 3.6
  const gr = 5.4
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, 1.5, 0]} castShadow receiveShadow><cylinderGeometry args={[r + 1.4, r + 1.8, 3, 10]} /></mesh>
      {Array.from({ length: bands }, (_, i) => (
        <mesh key={i} material={i % 2 ? M.red : M.white} position={[0, 3 + segH * (i + 0.5), 0]} castShadow>
          <cylinderGeometry args={[r - (r - rTop) * ((i + 1) / bands), r - (r - rTop) * (i / bands), segH, 10]} />
        </mesh>
      ))}
      <group position={[0, h - 1, 0]} scale={k}>
        <mesh material={M.brass} position={[0, -0.2, 0]}><cylinderGeometry args={[3.3, 3.0, 0.5, 12]} /></mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} material={M.brass} position={[Math.cos((i / 12) * Math.PI * 2) * 3.1, 0.5, Math.sin((i / 12) * Math.PI * 2) * 3.1]}><boxGeometry args={[0.1, 1, 0.1]} /></mesh>
        ))}
        <mesh material={!lit ? LM.dark : port ? LM.gold : M.glow} position={[0, 1.6, 0]}><cylinderGeometry args={[1.7, 1.7, 2.6, 8]} /></mesh>
        {port && restored && <mesh material={LM.gold} position={[0, 1.6, 0]}><sphereGeometry args={[1.25, 12, 8]} /></mesh>}
        <mesh material={M.copper} position={[0, 3.5, 0]} castShadow><coneGeometry args={[2.3, 2.2, 8]} /></mesh>
        <mesh material={M.brass} position={[0, 4.9, 0]}><sphereGeometry args={[0.35, 8, 6]} /></mesh>
        {lit && (
          <group ref={beam} position={[0, 1.6, 0]}>
            <mesh geometry={beamGeo} material={port ? beamGoldMat : beamMat} scale={port ? [1.25, 1.35, 1.35] : 1} />
            <mesh geometry={beamGeo} material={port ? beamGoldMat : beamMat} rotation-y={Math.PI} scale={port ? [1.25, 1.35, 1.35] : 1} />
          </group>
        )}
        {lit && !port && <pointLight ref={(l) => { if (l) lhLights.add(l) }} position={[0, 1.6, 0]} color="#ffcf7a" intensity={400} distance={90} />}
        {port && restored && <pointLight ref={(l) => { if (l) goldLights.add(l) }} position={[0, 1.6, 0]} color="#ffc060" intensity={900} distance={140} />}
      </group>
      {/* 复明后：塔身侧面装上重铸的巨型齿轮，缓缓转动 */}
      {port && restored && (
        <group position={[0, h * 0.52, r + 0.9]}>
          <group ref={gear}>
            <mesh material={M.brass}><torusGeometry args={[gr * 0.82, gr * 0.14, 6, 28]} /></mesh>
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2
              return <mesh key={i} material={M.brass} position={[Math.cos(a) * gr, Math.sin(a) * gr, 0]} rotation-z={a}><boxGeometry args={[gr * 0.28, gr * 0.2, gr * 0.25]} /></mesh>
            })}
            {[0, 1, 2].map((i) => <mesh key={i} material={M.copper} rotation-z={(i * Math.PI) / 3}><boxGeometry args={[gr * 1.6, gr * 0.12, gr * 0.15]} /></mesh>)}
            <mesh material={LM.gold} rotation-x={Math.PI / 2}><cylinderGeometry args={[gr * 0.2, gr * 0.2, gr * 0.36, 12]} /></mesh>
          </group>
        </group>
      )}
    </group>
  )
}

/** 港口吊车：缓慢回转 */
function Crane({ x, z, h: H }: { x: number; z: number; h: number }) {
  const jib = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => { jib.current.rotation.y = Math.sin(clock.elapsedTime * 0.15) * 0.9 + 0.4 })
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, 0.6, 0]} castShadow><boxGeometry args={[4, 1.2, 4]} /></mesh>
      {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([lx, lz], i) => (
        <mesh key={i} material={M.iron} position={[lx, H / 2, lz]} castShadow><boxGeometry args={[0.25, H, 0.25]} /></mesh>
      ))}
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} material={M.copper} position={[0, 2 + i * 3, 0]}><boxGeometry args={[1.7, 0.18, 1.7]} /></mesh>)}
      <group ref={jib} position={[0, H, 0]}>
        <mesh material={M.brass} position={[0, 0.8, 0]} castShadow><boxGeometry args={[2.2, 1.6, 2.6]} /></mesh>
        <mesh material={M.iron} position={[0, 1.2, 7]} castShadow><boxGeometry args={[0.5, 0.6, 16]} /></mesh>
        <mesh material={M.iron} position={[0, 1.2, -3]}><boxGeometry args={[0.5, 0.5, 5]} /></mesh>
        <mesh material={M.stone} position={[0, 0.6, -5]} castShadow><boxGeometry args={[1.8, 1.6, 1.6]} /></mesh>
        <mesh material={M.iron} position={[0, -4.2, 13.5]}><cylinderGeometry args={[0.05, 0.05, 10.6, 4]} /></mesh>
        <mesh material={M.brass} position={[0, -9.6, 13.5]}><torusGeometry args={[0.35, 0.1, 5, 8]} /></mesh>
        <mesh position={[0, -11.2, 13.5]} castShadow><boxGeometry args={[2.2, 2, 2.2]} /><meshStandardMaterial color="#a8763f" flatShading /></mesh>
      </group>
    </group>
  )
}

/** 循环上升的烟柱（实例化，无逐帧分配） */
function SmokeColumn({ y = 0, rate = 0.12, size = 2.2, rise = 26, n = 9 }: { y?: number; rate?: number; size?: number; rise?: number; n?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const m = useMemo(() => new THREE.Matrix4(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ref.current.count = Math.max(3, Math.floor(n * (0.4 + 0.6 * qcfg().particles)))
    for (let i = 0; i < n; i++) {
      const ph = (t * rate + i / n) % 1
      v.set(Math.sin(i * 2.1 + t * 0.3) * ph * 3 + ph * 6, y + ph * rise, Math.cos(i * 1.7) * ph * 3)
      const s = size * (0.5 + ph * 2.2) * (ph > 0.85 ? (1 - ph) / 0.15 : 1)
      ref.current.setMatrixAt(i, m.compose(v, q, sc.set(s, s, s)))
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[G.puff, M.smoke, n]} frustumCulled={false} />
}

/** 矿井井架：钢架塔 + 顶部天轮 */
function Headframe({ x, z, h }: { x: number; z: number; h: number }) {
  const wheel = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { wheel.current.rotation.x += Math.min(dt, 0.1) * 0.6 })
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.wood} position={[0, 2, 0]} castShadow><boxGeometry args={[7, 4, 6]} /></mesh>
      <mesh material={M.iron} position={[0, 4.3, 0]}><boxGeometry args={[7.4, 0.5, 6.4]} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} material={M.iron} position={[sx * 1.6, h / 2, sz * 1.6]} rotation={[sz * -0.05, 0, sx * 0.05]} castShadow><boxGeometry args={[0.35, h, 0.35]} /></mesh>
      ))}
      {Array.from({ length: 5 }, (_, i) => <mesh key={i} material={M.copper} position={[0, 5 + i * (h - 6) / 5, 0]}><boxGeometry args={[3.4 - i * 0.15, 0.2, 3.4 - i * 0.15]} /></mesh>)}
      <mesh material={M.iron} position={[2.6, h * 0.45, 0]} rotation-z={-0.35}><boxGeometry args={[0.3, h * 0.9, 0.3]} /></mesh>
      <group ref={wheel} position={[0, h, 0]} rotation-y={Math.PI / 2}>
        <mesh material={M.brass} rotation-y={Math.PI / 2}><torusGeometry args={[2.2, 0.18, 6, 18]} /></mesh>
        {[0, 1, 2, 3].map((i) => <mesh key={i} material={M.brass} rotation-x={(i * Math.PI) / 4}><boxGeometry args={[0.15, 4.3, 0.15]} /></mesh>)}
      </group>
      <mesh material={M.iron} position={[0, h / 2 + 1, 0]}><cylinderGeometry args={[0.04, 0.04, h - 2, 4]} /></mesh>
    </group>
  )
}

function Heap({ x, z, r }: { x: number; z: number; r: number }) {
  const geo = useMemo(() => jitter(new THREE.ConeGeometry(r, r * 0.9, 9, 2), r * 0.08, Math.round(x * 13 + z)), [x, z, r])
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} material={M.coal} position={[0, r * 0.45, 0]} castShadow receiveShadow />
      <mesh material={M.wood} position={[r * 0.9, 0.5, 0]}><boxGeometry args={[1.6, 1, 2.4]} /></mesh>
      <mesh material={M.coal} position={[r * 0.9, 1.1, 0]}><boxGeometry args={[1.3, 0.4, 2]} /></mesh>
    </group>
  )
}

function Chimney({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.brick} position={[0, h / 2, 0]} castShadow><cylinderGeometry args={[1.0, 1.7, h, 8]} /></mesh>
      {[0.35, 0.7].map((t) => <mesh key={t} material={M.brass} position={[0, h * t, 0]}><cylinderGeometry args={[1.7 - 0.7 * t + 0.08, 1.7 - 0.7 * t + 0.08, 0.35, 8]} /></mesh>)}
      <mesh material={M.iron} position={[0, h + 0.3, 0]}><cylinderGeometry args={[1.25, 1.1, 0.7, 8]} /></mesh>
      <SmokeColumn y={h + 1} />
    </group>
  )
}

function Windmill({ x, z, h }: { x: number; z: number; h: number }) {
  const blades = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { blades.current.rotation.z += Math.min(dt, 0.1) * 0.8 })
  const k = h / 9
  return (
    <group position={[x, 0, z]} scale={k} rotation-y={Math.atan2(-x, -z) + Math.PI}>
      <mesh material={M.white} position={[0, 4.5, 0]} castShadow><cylinderGeometry args={[1.6, 2.4, 9, 8]} /></mesh>
      <mesh material={M.copper} position={[0, 10, 0]} castShadow><coneGeometry args={[2.1, 2.4, 8]} /></mesh>
      <mesh material={M.woodDark} position={[0, 1.2, 2.3]}><boxGeometry args={[1.2, 2.2, 0.2]} /></mesh>
      <group ref={blades} position={[0, 8.2, 2.3]}>
        <mesh material={M.brass}><cylinderGeometry args={[0.3, 0.3, 0.6, 6]} /></mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} material={M.canvas} rotation-z={(i * Math.PI) / 2} position={[Math.cos((i * Math.PI) / 2) * 3, Math.sin((i * Math.PI) / 2) * 3, 0]}>
            <boxGeometry args={[5.6, 1.1, 0.08]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function WaterTower({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <group position={[x, 0, z]}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} material={M.woodDark} position={[sx * 1.8, h / 2, sz * 1.8]} castShadow><boxGeometry args={[0.35, h, 0.35]} /></mesh>
      ))}
      <mesh material={M.wood} position={[0, h * 0.4, 0]}><boxGeometry args={[3.8, 0.2, 3.8]} /></mesh>
      <mesh material={M.copper} position={[0, h + 1.8, 0]} castShadow><cylinderGeometry args={[3, 3, 3.6, 12]} /></mesh>
      {[0.6, 3].map((y) => <mesh key={y} material={M.brass} position={[0, h + y, 0]}><torusGeometry args={[3.02, 0.1, 4, 16]} /></mesh>)}
      <mesh material={M.red} position={[0, h + 4.4, 0]} castShadow><coneGeometry args={[3.3, 1.8, 12]} /></mesh>
    </group>
  )
}
function ClockTower({ x, z, h }: { x: number; z: number; h: number }) {
  const hand = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => { hand.current.rotation.z = -clock.elapsedTime * 0.2 })
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, 2, 0]} castShadow><boxGeometry args={[10, 4, 10]} /></mesh>
      <mesh material={M.brick} position={[0, h / 2, 0]} castShadow><boxGeometry args={[7, h, 7]} /></mesh>
      {[0.3, 0.6].map((t) => <mesh key={t} material={M.brass} position={[0, h * t, 0]}><boxGeometry args={[7.4, 0.4, 7.4]} /></mesh>)}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * Math.PI) / 2}>
          <mesh material={M.glow} position={[0, h - 4, 3.55]}><circleGeometry args={[2.4, 20]} /></mesh>
          <mesh material={M.brass} position={[0, h - 4, 3.56]}><ringGeometry args={[2.4, 2.8, 20]} /></mesh>
          {i === 0 && <group ref={hand} position={[0, h - 4, 3.6]}><mesh material={M.iron} position={[0, 0.9, 0]}><boxGeometry args={[0.2, 1.9, 0.05]} /></mesh></group>}
          <mesh material={M.iron} position={[0, h - 4, 3.6]}><boxGeometry args={[1.4, 0.18, 0.04]} /></mesh>
        </group>
      ))}
      <mesh material={M.copper} position={[0, h + 3.5, 0]} castShadow><coneGeometry args={[5.4, 7, 4]} /></mesh>
      <mesh material={M.brass} position={[0, h + 7.5, 0]}><sphereGeometry args={[0.5, 8, 6]} /></mesh>
    </group>
  )
}
function BigGear({ x, z, r }: { x: number; z: number; r: number }) {
  const g = useRef<THREE.Group>(null!)
  useFrame((_, dt) => { g.current.rotation.z += Math.min(dt, 0.1) * 0.25 })
  const teeth = 14
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, 0.6, 0]}><boxGeometry args={[3, 1.2, 2]} /></mesh>
      <mesh material={M.iron} position={[0, r / 2 + 0.6, 0]}><boxGeometry args={[0.6, r + 1.2, 0.6]} /></mesh>
      <group ref={g} position={[0, r + 1.2, 0]}>
        <mesh material={M.brass}><torusGeometry args={[r * 0.82, r * 0.14, 6, 28]} /></mesh>
        {Array.from({ length: teeth }, (_, i) => {
          const a = (i / teeth) * Math.PI * 2
          return <mesh key={i} material={M.brass} position={[Math.cos(a) * r, Math.sin(a) * r, 0]} rotation-z={a}><boxGeometry args={[r * 0.3, r * 0.22, r * 0.25]} /></mesh>
        })}
        {[0, 1, 2].map((i) => <mesh key={i} material={M.copper} rotation-z={(i * Math.PI) / 3}><boxGeometry args={[r * 1.6, r * 0.12, r * 0.15]} /></mesh>)}
        <mesh material={M.copper} rotation-x={Math.PI / 2}><cylinderGeometry args={[r * 0.18, r * 0.18, r * 0.35, 10]} /></mesh>
      </group>
    </group>
  )
}

/** 果园：成行的果树 + 果实（实例化） */
function Orchard({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const { trees, fruits } = useMemo(() => {
    const trees: TreeSpec[] = [], fruits: [number, number, number][] = []
    const r = rng(Math.round(x * 31 + z))
    for (let i = -w / 2; i <= w / 2; i += 6) for (let j = -d / 2; j <= d / 2; j += 6.5) {
      const tx = x + i + (r() - 0.5), tz = z + j + (r() - 0.5)
      trees.push({ x: tx, z: tz, s: 0.75 + r() * 0.2, kind: 1 })
      for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2, e = r() * 1.2 - 0.3
        fruits.push([tx + Math.cos(a) * 1.7 * 0.8, 3.4 + e, tz + Math.sin(a) * 1.7 * 0.8])
      }
    }
    return { trees, fruits }
  }, [x, z, w, d])
  const ref = useRef<THREE.InstancedMesh>(null!)
  const fg = useMemo(() => new THREE.IcosahedronGeometry(0.32, 0), [])
  useEffect(() => {
    const m = new THREE.Matrix4()
    fruits.forEach((f, i) => ref.current.setMatrixAt(i, m.makeTranslation(f[0], f[1], f[2])))
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [fruits])
  return (
    <>
      <Trees trees={trees} />
      <instancedMesh ref={ref} args={[fg, M.fruit, fruits.length]} />
      {/* 田埂 */}
      {Array.from({ length: Math.floor(w / 6) + 1 }, (_, i) => (
        <mesh key={i} material={M.dirt} position={[x - w / 2 + i * 6 + 3, 0.04, z]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[1.4, d + 4]} /></mesh>
      ))}
    </>
  )
}

function Pond({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[r + 1.2, 14]} /></mesh>
      <mesh material={M.water} position={[0, 0.12, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[r, 14]} /></mesh>
    </group>
  )
}

/** 从岛缘倾泻入云海的瀑布（滚动条纹着色器） */
const fallMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uT: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uT; varying vec2 vUv;
    void main(){
      float s = fract(vUv.y * 6.0 + uT * 0.8 + sin(vUv.x * 20.0) * 0.1);
      float a = (0.55 + 0.35 * step(0.5, s)) * smoothstep(0.0, 0.25, vUv.y) * (1.0 - abs(vUv.x - 0.5) * 1.6);
      gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), vec3(1.0), step(0.5, s)), a * 0.8);
    }`,
})
function Waterfall({ isl, a }: { isl: IslandDef; a: number }) {
  useFrame(({ clock }) => { fallMat.uniforms.uT.value = clock.elapsedTime })
  const [x, z] = rotY(0, isl.R - 1, a)
  const H = isl.top - 15
  return (
    <group position={[x, 0, z]} rotation-y={(a * Math.PI) / 180}>
      <mesh material={M.water} position={[0, 0.15, -6]} rotation-x={-Math.PI / 2}><planeGeometry args={[4, 12]} /></mesh>
      <mesh material={fallMat} position={[0, -H / 2, 2.5]}><planeGeometry args={[5, H, 1, 8]} /></mesh>
      <mesh material={fallMat} position={[0, -H / 2, 3.2]} rotation-y={0.4}><planeGeometry args={[3.5, H, 1, 8]} /></mesh>
    </group>
  )
}

function Ember({ x, z, r }: { x: number; z: number; r: number }) {
  const geo = useMemo(() => jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.25, Math.round(x * 7 + z * 3)), [x, z, r])
  const glow = useRef<THREE.PointLight>(null!)
  useFrame(({ clock }) => { glow.current.intensity = 160 + Math.sin(clock.elapsedTime * 3 + x) * 50 })
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} material={M.rockDark} position={[0, r * 0.3, 0]} castShadow />
      <mesh material={M.ember} position={[0, r * 0.75, 0]}><icosahedronGeometry args={[r * 0.45, 0]} /></mesh>
      <pointLight ref={glow} position={[0, r + 1, 0]} color="#ff6a2a" distance={r * 6} />
      <SmokeColumn y={r} rate={0.08} size={r * 0.4} rise={30} n={7} />
    </group>
  )
}

function Reeds({ x, z, r }: { x: number; z: number; r: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const n = Math.round(r * r * 0.9)
  const geo = useMemo(() => new THREE.ConeGeometry(0.12, 2.6, 3).translate(0, 1.3, 0), [])
  useEffect(() => {
    const rr = rng(Math.round(x * 17 + z))
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler()
    for (let i = 0; i < n; i++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * r
      q.setFromEuler(e.set((rr() - 0.5) * 0.4, 0, (rr() - 0.5) * 0.4))
      const s = 0.6 + rr() * 0.8
      ref.current.setMatrixAt(i, m.compose(new THREE.Vector3(x + Math.cos(a) * d, 0, z + Math.sin(a) * d), q, new THREE.Vector3(s, s, s)))
    }
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [x, z, r, n])
  return (
    <>
      <mesh material={M.water} position={[x, 0.08, z]} rotation-x={-Math.PI / 2}><circleGeometry args={[r * 0.7, 12]} /></mesh>
      <instancedMesh ref={ref} args={[geo, M.reed, n]} />
    </>
  )
}

/** v1.3 冰晶簇：发光的拉长八面体 */
function Crystal({ x, z, r }: { x: number; z: number; r: number }) {
  const list = useMemo(() => {
    const rr = rng(Math.round(x * 11 + z * 5))
    return Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * Math.PI * 2 + rr(), d: i === 0 ? 0 : r * (0.35 + rr() * 0.4), h: (i === 0 ? 2.4 : 1.2 + rr()) * r, tilt: i === 0 ? 0 : 0.25 + rr() * 0.35 }))
  }, [x, z, r])
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.rockDark} position={[0, 0.4, 0]}><dodecahedronGeometry args={[r * 0.7, 0]} /></mesh>
      {list.map((c, i) => (
        <mesh key={i} material={M.crystal} position={[Math.cos(c.a) * c.d, c.h * 0.42, Math.sin(c.a) * c.d]} rotation={[Math.sin(c.a) * c.tilt, 0, -Math.cos(c.a) * c.tilt]} scale={[r * 0.28, c.h * 0.5, r * 0.28]} castShadow>
          <octahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  )
}

/** v1.3 观星台：石砌底座 + 铜圆顶 + 伸出的望远镜 */
function Observatory({ x, z, h }: { x: number; z: number; h: number }) {
  const dome = useRef<THREE.Group>(null!)
  useFrame(({ clock }) => { dome.current.rotation.y = Math.sin(clock.elapsedTime * 0.05) * 1.2 })
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, h / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[6.5, 7.2, h, 14]} /></mesh>
      <mesh material={M.brass} position={[0, h, 0]}><cylinderGeometry args={[6.8, 6.8, 0.5, 16]} /></mesh>
      <group ref={dome} position={[0, h + 0.2, 0]}>
        <mesh material={M.copper} castShadow><sphereGeometry args={[6.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh material={M.snow} position={[0, 0.15, 0]} scale={[1.02, 0.35, 1.02]}><sphereGeometry args={[6.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 4]} /></mesh>
        <mesh material={M.iron} position={[0, 3.5, 4.2]} rotation-x={-0.75}><cylinderGeometry args={[0.9, 1.3, 9, 10]} /></mesh>
        <mesh material={M.brass} position={[0, 6.6, 7.2]} rotation-x={-0.75}><torusGeometry args={[0.95, 0.15, 6, 12]} /></mesh>
      </group>
      <mesh material={M.glow} position={[0, h * 0.5, 7.1]}><boxGeometry args={[1.4, 2, 0.2]} /></mesh>
    </group>
  )
}

/** v1.3 温泉：石圈 + 青绿水面 + 白色蒸汽 */
function HotSpring({ x, z, r }: { x: number; z: number; r: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.rockDark} position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}><ringGeometry args={[r, r + 1.6, 16]} /></mesh>
      <mesh material={M.stone} position={[0, 0.06, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[r + 1.8, 16]} /></mesh>
      <mesh material={M.spring} position={[0, 0.18, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[r, 16]} /></mesh>
      <SteamColumn r={r} />
    </group>
  )
}
function SteamColumn({ r }: { r: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const n = 12
  const m = useMemo(() => new THREE.Matrix4(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ref.current.count = Math.max(4, Math.floor(n * (0.4 + 0.6 * qcfg().particles)))
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.09 + i / n) % 1
      const a = i * 2.4
      v.set(Math.cos(a) * r * 0.5 * (1 - ph * 0.5) + ph * 4, 0.5 + ph * 18, Math.sin(a) * r * 0.5 * (1 - ph * 0.5))
      const s = r * 0.25 * (0.6 + ph * 2) * (ph > 0.8 ? (1 - ph) / 0.2 : 1)
      ref.current.setMatrixAt(i, m.compose(v, q, sc.set(s, s * 0.8, s)))
    }
    ref.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[G.puff, M.steam, n]} frustumCulled={false} />
}

/** v1.3 北境哨塔：石塔 + 火盆 + 旗帜 */
function Watchtower({ x, z, h }: { x: number; z: number; h: number }) {
  const flag = useRef<THREE.Mesh>(null!)
  const fire = useRef<THREE.PointLight>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    flag.current.rotation.y = Math.PI / 2 + Math.sin(t * 2.2) * 0.25
    fire.current.intensity = (180 + Math.sin(t * 9) * 40) * (0.4 + env.night)
    fire.current.visible = qcfg().lights
  })
  return (
    <group position={[x, 0, z]}>
      <mesh material={M.stone} position={[0, h / 2, 0]} castShadow receiveShadow><cylinderGeometry args={[3.2, 4.2, h, 8]} /></mesh>
      {[0.3, 0.65].map((t) => <mesh key={t} material={M.snow} position={[0, h * t, 0]}><cylinderGeometry args={[4.2 - t * 1.0, 4.2 - t * 1.0, 0.35, 8]} /></mesh>)}
      <mesh material={M.stone} position={[0, h + 0.8, 0]}><cylinderGeometry args={[4.6, 4, 1.6, 8]} /></mesh>
      {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <mesh key={i} material={M.stone} position={[Math.cos(a) * 4.2, h + 2.2, Math.sin(a) * 4.2]}><boxGeometry args={[1.2, 1.4, 1.2]} /></mesh> })}
      <mesh material={M.iron} position={[0, h + 2.2, 0]}><cylinderGeometry args={[1.4, 0.8, 1.2, 8]} /></mesh>
      <mesh material={M.fire} position={[0, h + 3.2, 0]}><icosahedronGeometry args={[1.1, 0]} /></mesh>
      <pointLight ref={fire} position={[0, h + 4, 0]} color="#ff8a3a" distance={60} />
      <mesh material={M.woodDark} position={[2.8, h + 6, 0]}><cylinderGeometry args={[0.1, 0.12, 8, 5]} /></mesh>
      <mesh ref={flag} material={M.red} position={[2.8, h + 9, 0]}><boxGeometry args={[3, 1.6, 0.06]} /></mesh>
      <mesh material={M.glow} position={[0, h * 0.55, 3.3]}><boxGeometry args={[0.9, 1.6, 0.1]} /></mesh>
    </group>
  )
}

/** v1.3 驯鹿围栏：木栅栏圈 + 方块驯鹿 */
function Pen({ x, z, r }: { x: number; z: number; r: number }) {
  const posts = 18
  const deer = useMemo(() => {
    const rr = rng(Math.round(x * 3 + z * 7 + r))
    return Array.from({ length: 6 }, () => ({ a: rr() * Math.PI * 2, d: rr() * r * 0.7, yaw: rr() * Math.PI * 2, s: 0.85 + rr() * 0.3 }))
  }, [x, z, r])
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: posts }, (_, i) => {
        const a = (i / posts) * Math.PI * 2, a2 = ((i + 0.5) / posts) * Math.PI * 2
        return (
          <group key={i}>
            <mesh material={M.woodDark} position={[Math.cos(a) * r, 0.7, Math.sin(a) * r]} castShadow><boxGeometry args={[0.3, 1.4, 0.3]} /></mesh>
            <mesh material={M.wood} position={[Math.cos(a2) * r, 1.0, Math.sin(a2) * r]} rotation-y={-a2}><boxGeometry args={[0.12, 0.14, (2 * Math.PI * r) / posts]} /></mesh>
          </group>
        )
      })}
      {deer.map((d, i) => (
        <group key={i} position={[Math.cos(d.a) * d.d, 0, Math.sin(d.a) * d.d]} rotation-y={d.yaw} scale={d.s}>
          <mesh material={M.fur} position={[0, 1.3, 0]} castShadow><boxGeometry args={[0.8, 0.8, 1.8]} /></mesh>
          {[[-0.28, -0.6], [0.28, -0.6], [-0.28, 0.6], [0.28, 0.6]].map(([lx, lz], j) => <mesh key={j} material={M.woodDark} position={[lx, 0.45, lz]}><boxGeometry args={[0.16, 0.9, 0.16]} /></mesh>)}
          <mesh material={M.fur} position={[0, 1.95, 1.05]} rotation-x={-0.5}><boxGeometry args={[0.4, 0.8, 0.4]} /></mesh>
          <mesh material={M.fur} position={[0, 2.35, 1.35]}><boxGeometry args={[0.38, 0.38, 0.6]} /></mesh>
          <mesh material={M.white} position={[0, 1.55, -0.95]}><boxGeometry args={[0.3, 0.3, 0.1]} /></mesh>
          {[-1, 1].map((sx) => <mesh key={sx} material={M.antler} position={[sx * 0.3, 2.85, 1.25]} rotation-z={sx * 0.5}><boxGeometry args={[0.08, 0.8, 0.08]} /></mesh>)}
          {[-1, 1].map((sx) => <mesh key={`b${sx}`} material={M.antler} position={[sx * 0.45, 3.1, 1.25]} rotation-x={0.6}><boxGeometry args={[0.07, 0.07, 0.5]} /></mesh>)}
        </group>
      ))}
      <mesh material={M.wood} position={[r * 0.5, 0.4, -r * 0.4]}><boxGeometry args={[2.6, 0.6, 1]} /></mesh>
    </group>
  )
}

function FeatureMesh({ f, isl }: { f: Feature; isl: IslandDef }) {
  switch (f.k) {
    case 'warehouse': case 'house': return <Building f={f} />
    case 'lighthouse': return <Lighthouse {...f} port={isl.id === 'port'} />
    case 'crane': return <Crane {...f} />
    case 'headframe': return <Headframe {...f} />
    case 'heap': return <Heap {...f} />
    case 'chimney': return <Chimney {...f} />
    case 'windmill': return <Windmill {...f} />
    case 'watertower': return <WaterTower {...f} />
    case 'clocktower': return <ClockTower {...f} />
    case 'gear': return <BigGear {...f} />
    case 'orchard': return <Orchard {...f} />
    case 'pond': return <Pond {...f} />
    case 'waterfall': return <Waterfall isl={isl} a={f.a} />
    case 'ember': return <Ember {...f} />
    case 'reeds': return <Reeds {...f} />
    case 'crystal': return <Crystal {...f} />
    case 'observatory': return <Observatory {...f} />
    case 'hotspring': return <HotSpring {...f} />
    case 'watchtower': return <Watchtower {...f} />
    case 'pen': return <Pen {...f} />
  }
}

/** 特征占地半径（用于避开随机树木） */
function footprint(f: Feature): [number, number, number] | null {
  switch (f.k) {
    case 'warehouse': case 'house': return [f.x, f.z, Math.max(f.w, f.d) / 2 + 3]
    case 'orchard': return [f.x, f.z, Math.max(f.w, f.d) / 2 + 3]
    case 'waterfall': return null
    case 'heap': case 'pond': case 'reeds': case 'ember': case 'gear': return [f.x, f.z, f.r + 3]
    case 'clocktower': return [f.x, f.z, 9]
    case 'crystal': case 'hotspring': case 'pen': return [f.x, f.z, f.r + 3]
    case 'observatory': return [f.x, f.z, 10]
    case 'watchtower': return [f.x, f.z, 7]
    default: return [f.x, f.z, 6]
  }
}

function scatterTrees(isl: IslandDef): TreeSpec[] {
  const r = rng(isl.seed * 13 + 99)
  const out: TreeSpec[] = []
  const fps = isl.features.map(footprint).filter((v): v is [number, number, number] => !!v)
  if (isl.id === 'port') fps.push([0, 6, 11], [0, 30, 8])
  let guard = 0
  while (out.length < isl.trees.n && guard++ < 800) {
    const a = r() * Math.PI * 2, d = 6 + Math.sqrt(r()) * (isl.R - 10)
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    // 栈桥通道
    const [px, pz] = rotY(x, z, -isl.pier)
    if (pz > isl.R * 0.45 && Math.abs(px) < 9) continue
    if (fps.some(([fx, fz, fr]) => Math.hypot(x - fx, z - fz) < fr)) continue
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 4.5)) continue
    out.push({ x, z, s: 0.8 + r() * 0.7, kind: isl.trees.kinds[Math.floor(r() * isl.trees.kinds.length)] })
  }
  return out
}

/** 港口额外陈设：广场、日晷、货箱、木桶、灯柱、旗杆 */
function PortExtras() {
  return (
    <group>
      <mesh material={M.stone} position={[0, 0.06, 6]} rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[9, 16]} /></mesh>
      <mesh material={M.brass} position={[0, 0.9, 6]} castShadow><cylinderGeometry args={[0.6, 0.9, 1.8, 8]} /></mesh>
      <mesh material={M.copper} position={[0, 2.2, 6]} rotation-x={0.4}><torusGeometry args={[1.1, 0.12, 6, 16]} /></mesh>
      <mesh material={M.stone} position={[0, 0.05, 32]} rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[6, 38]} /></mesh>
      <Crate pos={[6, 0, 38]} />
      <Crate pos={[7.5, 0, 38.2]} s={1.2} c="#7d5a3a" />
      <Crate pos={[6.6, 1.4, 38.1]} s={1.1} c="#b07a42" />
      <Crate pos={[-6, 0, 40]} s={1.6} c="#6f5a44" />
      {[[-24, 14], [-22.6, 15], [26, 18]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.7, z]} castShadow><cylinderGeometry args={[0.55, 0.55, 1.4, 8]} /><meshStandardMaterial color="#6a4528" flatShading /></mesh>
      ))}
      {[[-5, 14], [5, 14], [-5, 24], [5, 24]].map(([x, z], i) => <Lamp key={i} pos={[x, 0, z]} />)}
      <group position={[-8, 0, 46]}>
        <mesh material={M.brass} position={[0, 6, 0]}><cylinderGeometry args={[0.1, 0.14, 12, 6]} /></mesh>
        <mesh material={M.red} position={[1.4, 11, 0]} rotation-y={Math.PI / 2}><coneGeometry args={[0.8, 2.8, 3]} /></mesh>
      </group>
    </group>
  )
}

function Island({ isl }: { isl: IslandDef }) {
  const trees = useMemo(() => scatterTrees(isl), [isl])
  return (
    <group position={[isl.x, isl.top, isl.z]}>
      <Rock isl={isl} />
      <Pier isl={isl} />
      {isl.features.map((f, i) => <FeatureMesh key={i} f={f} isl={isl} />)}
      <Trees trees={trees} />
      {isl.id === PORT.id && <PortExtras />}
    </group>
  )
}

export function Islands() {
  // 夜间：窗户 / 灯更亮，灯塔光束更显眼；雾中灯光不受雾遮挡
  useFrame(() => {
    const n = env.night
    M.glow.emissiveIntensity = 1.4 + n * 3.2
    M.ember.emissiveIntensity = 2.0 + n * 2
    beamMat.uniforms.uK.value = 0.32 + n * 0.6 + env.fog * 0.5
    const lights = qcfg().lights
    for (const l of lhLights) { l.intensity = 400 + n * 1400; l.visible = lights }
    for (const l of goldLights) { l.intensity = 900 + n * 2600; l.visible = lights }
    beamGoldMat.uniforms.uK.value = 0.55 + n * 0.85 + env.fog * 0.5
    LM.gold.emissiveIntensity = 3 + n * 3
    M.crystal.emissiveIntensity = 1.2 + n * 2.4
    M.fire.emissiveIntensity = 2.5 + n * 2
  })
  return <>{ISLANDS.map((isl) => <Island key={isl.id} isl={isl} />)}</>
}
