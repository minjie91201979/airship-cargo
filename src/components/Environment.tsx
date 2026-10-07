import { QUALITY_CFG, qcfg, useSettings } from '../game/settings'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CLOUD_TOP } from '../game/world'
import { rng } from '../game/rng'
import { env, frostify, newPalette, palette, sunDir } from '../game/env'

/** M0 夕阳方向（云海暖色朝向用） */
export const SUN_DIR = new THREE.Vector3(-0.72, 0.15, 0.68).normalize()
const pal = newPalette()
const FOG_DAY = new THREE.Color('#d4d6d8'), FOG_NIGHT = new THREE.Color('#262a36')
const tmpC = new THREE.Color()

/** 天空、日月光照与雾（随 env.tod 变化） */
export function Environment({ focus }: { focus: React.RefObject<THREE.Vector3> }) {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const amb = useRef<THREE.AmbientLight>(null!)
  const { scene } = useThree()
  const fog = useMemo(() => new THREE.Fog('#eeb38e', 320, 2100), [])
  // 画质：阴影开关与分辨率
  const quality = useSettings((s) => s.quality)
  useEffect(() => {
    const L = sun.current, n = QUALITY_CFG[quality].shadow
    L.castShadow = n > 0
    if (n > 0 && L.shadow.mapSize.x !== n) {
      L.shadow.mapSize.set(n, n)
      L.shadow.map?.dispose()
      ;(L.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null
    }
  }, [quality])
  useEffect(() => {
    scene.fog = fog
    scene.add(sun.current.target)
    return () => { scene.fog = null }
  }, [scene, fog])
  const lightDir = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    palette(env.tod, pal)
    frostify(pal, env.frost)
    env.night = pal.night
    sunDir(env.tod, env.sun)
    // 夜里用月光（太阳反方向）照明
    lightDir.copy(env.sun)
    if (lightDir.y < 0.05) { lightDir.negate(); lightDir.y = Math.max(0.25, lightDir.y) }
    const f = focus.current
    sun.current.position.copy(f).addScaledVector(lightDir, 400)
    sun.current.target.position.copy(f)
    const fl = env.flash, st = env.storm
    sun.current.color.copy(pal.sun)
    sun.current.intensity = pal.sunI * (1 - env.fog * 0.6) * (1 - st * 0.8) + fl * 2.0
    hemi.current.color.copy(pal.hemiSky)
    hemi.current.groundColor.copy(pal.hemiGround)
    hemi.current.intensity = pal.hemiI * (1 - st * 0.55) + fl * 1.6
    amb.current.intensity = pal.amb + fl * 0.4
    // 雾：雾区 / 黎明薄雾时可见度骤降
    const fd = env.fog
    tmpC.copy(FOG_DAY).lerp(FOG_NIGHT, pal.night)
    fog.color.copy(pal.fog).lerp(tmpC, Math.min(1, fd * 1.2))
    // 雷暴中：天色压暗、雨幕降低能见度
    if (st > 0) fog.color.lerp(tmpC.set(pal.night > 0.5 ? '#14161e' : '#4a4e5c'), st * 0.85)
    if (fl > 0) fog.color.lerp(tmpC.set('#b8c0f0'), fl * 0.3)
    const nightK = 1 - pal.night * 0.35
    fog.near = THREE.MathUtils.lerp(THREE.MathUtils.lerp(320 * nightK, 60, st), 8, fd)
    fog.far = THREE.MathUtils.lerp(THREE.MathUtils.lerp(2100 * nightK, 700, st), 150, Math.pow(fd, 0.7))
  })
  return (
    <>
      <SkyDome />
      <Stars />
      <hemisphereLight ref={hemi} args={['#ffd9bd', '#7a6386', 1.15]} />
      <ambientLight ref={amb} color="#ffe6d2" intensity={0.25} />
      <directionalLight
        ref={sun}
        color="#ffb27a"
        intensity={2.6}
        castShadow
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={10}
        shadow-camera-far={900}
        shadow-bias={-0.0005}
      />
      <CloudSea />
    </>
  )
}

/** 渐变天穹：颜色随时刻变化，带太阳光晕、月亮与雾幕 */
function SkyDome() {
  const ref = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      uSun: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uFog: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFlash: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uSun, uHorizon, uLow, uMid, uZenith, uSunCol, uFogCol; uniform float uNight, uFog, uFlash; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uLow, smoothstep(0.0, 0.12, h));
        col = mix(col, uMid, smoothstep(0.1, 0.35, h));
        col = mix(col, uZenith, smoothstep(0.3, 0.9, h));
        col = mix(col, uHorizon * 0.95, smoothstep(0.0, -0.2, h));
        float day = 1.0 - uNight;
        float s = max(dot(d, uSun), 0.0);
        float az = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz + 1e-5)), 0.0);
        float sunUp = smoothstep(-0.12, 0.05, uSun.y);
        col += uSunCol * pow(az, 6.0) * 0.35 * (1.0 - smoothstep(0.0, 0.4, abs(h))) * sunUp * (1.0 - smoothstep(0.35, 0.8, uSun.y));
        col += uSunCol * pow(s, 10.0) * 0.55 * sunUp;
        col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9985, 0.9993, s) * 1.6 * sunUp;
        // 月亮（太阳反方向）
        vec3 mdir = normalize(vec3(-uSun.x, abs(uSun.y) * 0.8 + 0.25, -uSun.z));
        float m = dot(d, mdir);
        col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9990, 0.9994, m) * 1.4 * uNight;
        col += vec3(0.5, 0.6, 0.9) * pow(max(m, 0.0), 60.0) * 0.25 * uNight;
        col = mix(col, uFogCol, uFog * 0.85 * (1.0 - smoothstep(0.1, 0.6, h) * 0.5));
        col += vec3(0.6, 0.65, 0.9) * uFlash * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }), [])
  useFrame(({ scene }) => {
    ref.current.position.copy(camera.position)
    const u = mat.uniforms
    u.uSun.value.copy(env.sun)
    u.uHorizon.value.copy(pal.horizon); u.uLow.value.copy(pal.low); u.uMid.value.copy(pal.mid); u.uZenith.value.copy(pal.zenith)
    u.uSunCol.value.copy(pal.sun)
    u.uNight.value = pal.night
    u.uFog.value = Math.max(env.fog, env.storm * 0.9)
    if (scene.fog) u.uFogCol.value.copy((scene.fog as THREE.Fog).color)
    u.uFlash.value = env.flash
  })
  return <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[3000, 32, 20]} /></mesh>
}

/** 星空：夜里显现 */
function Stars() {
  const ref = useRef<THREE.Points>(null!)
  const { camera } = useThree()
  const { geo, mat } = useMemo(() => {
    const r = rng(42)
    const n = 900
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2
      const y = Math.abs(u) * 0.95 + 0.05
      const k = Math.sqrt(1 - y * y)
      p.set([Math.cos(th) * k * 2800, y * 2800, Math.sin(th) * k * 2800], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    const mat = new THREE.PointsMaterial({ color: '#fff8e8', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
    return { geo, mat }
  }, [])
  useFrame(() => {
    ref.current.position.copy(camera.position)
    mat.opacity = Math.max(0, pal.night - 0.3) / 0.7 * (1 - env.fog)
    ref.current.visible = mat.opacity > 0.01
  })
  return <points ref={ref} geometry={geo} material={mat} renderOrder={-9} frustumCulled={false} />
}

/** 云海：底层柔和平面 + 低多边形云团（3×3 平铺并跟随镜头，永远到不了边）+ 高空卷云 */
const TILE = 1500
const PER_TILE = 300
function CloudSea() {
  const { tiles, root } = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 2)
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: '#ffffff', emissive: '#b07a78', emissiveIntensity: 0.45 })
    const base = new THREE.InstancedMesh(geo, mat, PER_TILE)
    const r = rng(1234)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler()
    const col = new THREE.Color(), warmC = new THREE.Color('#fff0dc')
    const sunAz = Math.atan2(SUN_DIR.z, SUN_DIR.x)
    for (let i = 0; i < PER_TILE; i++) {
      const big = 24 + r() * 46
      p.set((r() - 0.5) * TILE, CLOUD_TOP - 10 + r() * 9, (r() - 0.5) * TILE)
      s.set(big * (1 + r() * 0.5), big * (0.42 + r() * 0.3), big * (1 + r() * 0.5))
      q.setFromEuler(e.set(0, r() * Math.PI, 0))
      base.setMatrixAt(i, m.compose(p, q, s))
      const warm = 0.5 + 0.5 * Math.cos(Math.atan2(p.z, p.x) - sunAz)
      col.set('#fbe9ee').lerp(warmC, warm * 0.8).multiplyScalar(0.95 + r() * 0.08)
      base.setColorAt(i, col)
    }
    const root = new THREE.Group()
    const tiles: THREE.InstancedMesh[] = []
    for (let i = 0; i < 9; i++) {
      const t = i === 0 ? base : new THREE.InstancedMesh(geo, mat, PER_TILE)
      if (i > 0) { t.instanceMatrix = base.instanceMatrix; t.instanceColor = base.instanceColor }
      t.receiveShadow = true
      t.frustumCulled = false
      tiles.push(t)
      root.add(t)
    }
    return { tiles, root }
  }, [])
  const high = useRef<THREE.InstancedMesh>(null!)
  const NH = 90
  const highGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 1), [])
  useEffect(() => {
    const r = rng(77)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler()
    for (let i = 0; i < NH; i++) {
      const rad = 900 + r() * 1700
      const th = r() * Math.PI * 2
      p.set(Math.cos(th) * rad, 420 + r() * 260, Math.sin(th) * rad)
      const big = 50 + r() * 90
      s.set(big * 2.4, big * 0.12, big * 0.9)
      q.setFromEuler(e.set(0, r() * Math.PI, 0))
      high.current.setMatrixAt(i, m.compose(p, q, s))
    }
    high.current.instanceMatrix.needsUpdate = true
  }, [])
  const base = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()
  const baseMat = useRef<THREE.MeshStandardMaterial>(null!)
  const highMat = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(({ clock }) => {
    // 云海随时刻着色
    const qc = qcfg().clouds
    for (const t of tiles) t.count = Math.floor(PER_TILE * (0.35 + 0.65 * qc))
    high.current.count = Math.floor(NH * qc)
    const cm = tiles[0].material as THREE.MeshStandardMaterial
    cm.color.copy(pal.cloud)
    cm.emissive.copy(pal.cloud).multiplyScalar(0.55)
    cm.emissiveIntensity = pal.cloudE * (1 - env.storm * 0.7) + env.flash * 0.5
    baseMat.current.color.copy(pal.cloud).multiplyScalar(0.95)
    baseMat.current.emissive.copy(pal.cloud).multiplyScalar(0.5)
    baseMat.current.emissiveIntensity = pal.cloudE * 0.8 * (1 - env.storm * 0.7) + env.flash * 0.4
    highMat.current.color.copy(pal.cloud).lerp(pal.horizon, 0.4)
    highMat.current.opacity = 0.5 * (1 - pal.night * 0.6)
    // 云团整体缓慢漂移，并按镜头所在格子重新平铺
    const drift = (clock.elapsedTime * 0.8) % TILE
    const cx = Math.round((camera.position.x) / TILE) * TILE
    const cz = Math.round((camera.position.z - drift) / TILE) * TILE
    tiles.forEach((t, i) => t.position.set(cx + ((i % 3) - 1) * TILE, 0, cz + (Math.floor(i / 3) - 1) * TILE + drift))
    base.current.position.x = camera.position.x
    base.current.position.z = camera.position.z
    high.current.position.x = camera.position.x * 0.7
    high.current.position.z = camera.position.z * 0.7
  })
  return (
    <>
      <mesh ref={base} rotation-x={-Math.PI / 2} position={[0, CLOUD_TOP - 7, 0]}>
        <planeGeometry args={[9000, 9000]} />
        <meshStandardMaterial ref={baseMat} color="#f6d8cc" roughness={1} emissive="#9a6a66" emissiveIntensity={0.35} />
      </mesh>
      <primitive object={root} />
      <instancedMesh ref={high} args={[highGeo, undefined, NH]} frustumCulled={false}>
        <meshBasicMaterial ref={highMat} color="#ffd9c4" transparent opacity={0.5} depthWrite={false} fog={false} />
      </instancedMesh>
    </>
  )
}
