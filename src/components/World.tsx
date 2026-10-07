import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { neutralTrim, ship, shiftGear, stepShip } from '../game/flight'
import * as flight from '../game/flight'
import { doTow, dockOrOpen, requestTow, tickSession } from '../game/session'
import { env, fogAt } from '../game/env'
import { decayFx, jettison } from '../game/hazards'
import * as hazards from '../game/hazards'
import { Hazards } from './Hazards'
import { Combat } from './Combat'
import * as combat from '../game/combat'
import { arms, dropFlare, pressHarpoon } from '../game/combat'
import { FogBanks } from './FogBanks'
import { isDown, onKey, readControls } from '../game/input'
import { pad, pollPad } from '../game/pad'
import { exitPhoto, photo, photoFilter, savePhoto, togglePhoto, usePhoto } from '../game/photo'
import { useGame } from '../game/store'
import { CLOUD_TOP, DOCKS, PORT, frostK } from '../game/world'
import { FrostFx } from './Frost'
import { hullOf } from '../game/hulls'
import { Airship, BRIDGE_EYE } from './Airship'
import { Environment } from './Environment'
import { Islands } from './Islands'
import { WindFx } from './WindFx'
import { Beacons } from './Beacons'
import { useEco } from '../game/economy'
import * as session from '../game/session'
import * as story from '../game/story'
import * as achv from '../game/achv'
import { useStory } from '../game/story'
import { audioCtx, updateAudio } from '../game/audio'
import { perf, useSettings } from '../game/settings'

const desired = new THREE.Vector3()
const look = new THREE.Vector3()
const tmp = new THREE.Vector3()
const euler = new THREE.Euler()
let hullScale = 1
const MENU_CENTER = new THREE.Vector3(0, PORT.top + 8, 40)

/** 鼠标拖拽环视（松开后自动回正） */
const orbit = { yaw: 0, pitch: 0, dragging: false }

function angleLerp(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export function World() {
  const { camera, gl, scene } = useThree()
  const focus = useRef(new THREE.Vector3(0, PORT.top, 0))
  const camYaw = useRef(0)
  const camLook = useRef(new THREE.Vector3().copy(MENU_CENTER))
  const snap = useRef(true)
  const dockK = useRef(1)
  const follow = useRef(new THREE.Vector3())
  const runId = useGame((s) => s.runId)
  const view = useGame((s) => s.view)

  useEffect(() => { snap.current = true }, [runId, view])

  // 调试钩子：URL 带 ?debug 时暴露飞艇状态（用于自动截图）
  useEffect(() => {
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as Record<string, unknown>).__ac = { ship, DOCKS, snap, camera, orbit, eco: useEco, session, game: useGame, env, hz: hazards, story, achv, settings: useSettings, perf, photo, usePhoto, pad, combat, flight, scene, get audio() { return audioCtx() } }
  }, [])

  // 单次按键
  useEffect(() => {
    const playing = () => useGame.getState().screen === 'play'
    onKey(['KeyW', 'ArrowUp'], () => playing() && shiftGear(1))
    onKey(['KeyS', 'ArrowDown'], () => playing() && shiftGear(-1))
    onKey(['KeyX'], () => playing() && neutralTrim())
    onKey(['KeyH'], () => {
      if (useGame.getState().screen === 'photo') { usePhoto.setState((p) => ({ hidePanel: !p.hidePanel })); return }
      if (requestTow()) snap.current = true
    })
    onKey(['Enter', 'NumpadEnter'], () => { if (useGame.getState().screen === 'photo') savePhoto() })
    onKey(['KeyP'], () => { if (!useStory.getState().cards.length) { togglePhoto(); snap.current = true } })
    onKey(['KeyE'], () => dockOrOpen())
    onKey(['KeyL'], () => { if (playing()) { env.searchlight = !env.searchlight; useEco.getState().note(env.searchlight ? '探照灯：开' : '探照灯：关') } })
    onKey(['KeyJ'], () => playing() && jettison())
    onKey(['KeyG'], () => playing() && pressHarpoon())
    onKey(['KeyZ'], () => playing() && dropFlare())
    onKey(['KeyM'], () => useGame.getState().screen !== 'menu' && useGame.getState().cycleMap())
    onKey(['KeyV'], () => { const sc = useGame.getState().screen; if (sc !== 'menu' && sc !== 'photo') useGame.getState().cycleView() })
    onKey(['Escape'], () => {
      if (useStory.getState().cards.length) return
      if (useGame.getState().screen === 'photo') { exitPhoto(); snap.current = true; return }
      useGame.getState().togglePause()
    })
  }, [])

  // 鼠标拖拽环视
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      orbit.dragging = true
      // v1.2：装备机炮时按住左键开火（设置可关）
      arms.mouse = useSettings.getState().mouseFire && useGame.getState().screen === 'play' && (useEco.getState().weapons?.gun ?? 0) > 0
    }
    const up = () => { orbit.dragging = false; arms.mouse = false }
    const move = (e: PointerEvent) => {
      if (!orbit.dragging) return
      const st = useSettings.getState()
      if (useGame.getState().screen === 'photo') {
        photo.yaw -= e.movementX * 0.004 * st.lookSens
        photo.pitch = THREE.MathUtils.clamp(photo.pitch - e.movementY * 0.004 * st.lookSens * (st.invertLook ? -1 : 1), -1.45, 1.45)
        return
      }
      orbit.yaw -= e.movementX * 0.005 * st.lookSens
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + e.movementY * 0.004 * st.lookSens * (st.invertLook ? -1 : 1), -0.5, 0.9)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', move)
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointermove', move) }
  }, [gl])

  useEffect(() => { arms.cam = camera }, [camera])

  // 照相模式截图：立即重绘一帧并按滤镜 / 暗角合成到 2D 画布
  useEffect(() => {
    photo.capture = () => {
      try {
        gl.render(scene, camera)
        const src = gl.domElement
        const c = document.createElement('canvas')
        c.width = src.width; c.height = src.height
        const ctx = c.getContext('2d')
        if (!ctx) return null
        const p = usePhoto.getState()
        ctx.filter = photoFilter(p)
        ctx.drawImage(src, 0, 0)
        ctx.filter = 'none'
        if (p.vignette > 0.01) {
          const r = Math.hypot(c.width, c.height) / 2
          const g = ctx.createRadialGradient(c.width / 2, c.height / 2, r * (0.75 - p.vignette * 0.4), c.width / 2, c.height / 2, r)
          g.addColorStop(0, 'rgba(0,0,0,0)')
          g.addColorStop(1, `rgba(10,6,2,${(0.25 + p.vignette * 0.65).toFixed(2)})`)
          ctx.fillStyle = g
          ctx.fillRect(0, 0, c.width, c.height)
        }
        return c.toDataURL('image/png')
      } catch { return null }
    }
    return () => { photo.capture = null }
  }, [gl, scene, camera])

  const padLookAt = useRef(-10)
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    pollPad(clock.elapsedTime)
    const { screen, view, portTab } = useGame.getState()
    if (rawDt > 0) perf.fps += (1 / rawDt - perf.fps) * Math.min(1, rawDt * 2)
    updateAudio(screen === 'play' ? 'play' : screen === 'menu' ? 'off' : 'duck', dt)
    const shopView = screen === 'port' && (portTab === 'shop' || portTab === 'yard')
    {
      const e = useEco.getState()
      hullScale = hullOf((shopView ? e.previewHull : null) ?? e.hull).scale
    }
    env.frost = snap.current ? frostK(ship.pos.z) : env.frost + (frostK(camera.position.z) - env.frost) * Math.min(1, Math.min(rawDt, 0.5) * 1.5)
    decayFx(dt)
    {
      const fp = screen === 'menu' ? camera.position : ship.pos
      const target = fogAt(fp.x, fp.y, fp.z, env.tod)
      env.fog += (target - env.fog) * Math.min(1, dt * 2)
      const sk = hazards.stormAt(camera.position.x, camera.position.y, camera.position.z).k
      env.storm += (sk - env.storm) * Math.min(1, dt * 2)
    }
    arms.key = screen === 'play' && isDown('KeyC')
    if (screen !== 'play') arms.mouse = false
    if (screen === 'play') {
      // 低帧率时用子步长保持物理稳定（最多补偿 0.1 秒）
      const c = readControls()
      let rem = Math.min(rawDt, 0.1)
      while (rem > 1e-4) {
        const h = Math.min(rem, 1 / 30)
        rem -= h
        if (stepShip(h, c) === 'sink') { doTow('坠入云海'); snap.current = true; break }
        tickSession(h)
      }
    } else if (screen === 'menu' || screen === 'port') {
      ship.time += dt
      ship.propAngle += dt * 1.2
    }
    // 照相模式：自由镜头（WASD / 鼠标拖拽 / Q E 升降 / Shift 加速；手柄 左摇杆移动 右摇杆转向 LT RT 升降）
    if (screen === 'photo') {
      const cam = camera as THREE.PerspectiveCamera
      if (photo.enter) {
        photo.enter = false
        photo.pos.copy(camera.position)
        camera.getWorldDirection(tmp)
        photo.yaw = Math.atan2(-tmp.x, -tmp.z)
        photo.pitch = Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1))
      }
      const lookS = useSettings.getState().lookSens
      photo.yaw -= pad.rx * rawDt * 1.8 * lookS
      photo.pitch = THREE.MathUtils.clamp(photo.pitch - pad.ry * rawDt * 1.4 * lookS, -1.45, 1.45)
      const sp = (isDown('ShiftLeft') || isDown('ShiftRight') ? 45 : 14) * Math.min(rawDt, 0.1)
      const k = (c: string) => (isDown(c) ? 1 : 0)
      const fwd = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - pad.ly
      const strafe = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + pad.lx
      const up = k('KeyE') + k('Space') - k('KeyQ') - k('KeyC') + pad.rt - pad.lt
      const fx = -Math.sin(photo.yaw) * Math.cos(photo.pitch), fy = Math.sin(photo.pitch), fz = -Math.cos(photo.yaw) * Math.cos(photo.pitch)
      const rx = Math.cos(photo.yaw), rz = -Math.sin(photo.yaw)
      photo.pos.x += (fx * fwd + rx * strafe) * sp
      photo.pos.y += (fy * fwd + up) * sp
      photo.pos.z += (fz * fwd + rz * strafe) * sp
      // 镜头限制在飞艇 400 米范围内、云海之上
      tmp.subVectors(photo.pos, ship.pos)
      if (tmp.length() > 400) photo.pos.copy(ship.pos).addScaledVector(tmp.normalize(), 400)
      if (photo.pos.y < CLOUD_TOP + 3) photo.pos.y = CLOUD_TOP + 3
      camera.position.copy(photo.pos)
      camera.rotation.set(photo.pitch, photo.yaw, 0, 'YXZ')
      const fov = usePhoto.getState().fov
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix() }
      env.tod = usePhoto.getState().tod
      return
    } else {
      const cam = camera as THREE.PerspectiveCamera
      if (cam.fov !== 58) { cam.fov = 58; cam.updateProjectionMatrix() }
    }
    // 手柄右摇杆环视
    if (Math.abs(pad.rx) + Math.abs(pad.ry) > 0.01) {
      const st = useSettings.getState()
      orbit.yaw -= pad.rx * dt * 2.4 * st.lookSens
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + pad.ry * dt * 1.6 * st.lookSens * (st.invertLook ? -1 : 1), -0.5, 0.9)
      padLookAt.current = clock.elapsedTime
    }
    if (!orbit.dragging && clock.elapsedTime - padLookAt.current > 1.2) {
      const k = Math.min(1, dt * 1.6)
      orbit.yaw += (0 - orbit.yaw) * k
      orbit.pitch += (0 - orbit.pitch) * k
    }

    const s = ship
    const fwdX = Math.sin(s.yaw), fwdZ = Math.cos(s.yaw)
    let posK = 1 - Math.exp(-3 * dt)
    let lookK = 1 - Math.exp(-6 * dt)

    if (screen === 'menu') {
      const a = clock.elapsedTime * 0.05 + 0.6
      desired.set(MENU_CENTER.x + Math.sin(a) * 175, PORT.top + 55 + Math.sin(clock.elapsedTime * 0.1) * 10, MENU_CENTER.z + Math.cos(a) * 175)
      look.copy(MENU_CENTER)
      focus.current.set(0, PORT.top, 20)
      posK = lookK = snap.current ? 1 : 1 - Math.exp(-1.5 * dt)
    } else if (shopView) {
      // 改装预览：镜头绕飞艇缓慢环绕，飞艇位于画面右侧（左侧是改装面板）
      focus.current.copy(s.pos)
      const a = s.yaw + 1.75 + Math.sin(clock.elapsedTime * 0.18) * 0.55 + orbit.yaw
      const dist = 60 * Math.max(1, hullScale * 1.05)
      desired.set(s.pos.x - Math.sin(a) * dist, s.pos.y + 6 + orbit.pitch * 30, s.pos.z - Math.cos(a) * dist)
      const dx = s.pos.x - desired.x, dz = s.pos.z - desired.z, L = Math.hypot(dx, dz) || 1
      const off = 32 * Math.max(1, hullScale * 1.25)
      look.set(s.pos.x + (dz / L) * off, s.pos.y - 4, s.pos.z - (dx / L) * off)
      posK = lookK = 1 - Math.exp(-2.5 * dt)
      if (snap.current) posK = lookK = 1
    } else {
      focus.current.copy(s.pos)
      if (view === 'chase') {
        // 系泊时用侧前方机位展示港口，解缆后平滑转到船尾
        const tYaw = s.docked ? s.yaw + 2.5 : s.yaw
        camYaw.current = snap.current ? tYaw : angleLerp(camYaw.current, tYaw, 1 - Math.exp(-(s.docked ? 2.2 : 1.6) * dt))
        const a = camYaw.current + orbit.yaw
        dockK.current += ((s.docked ? 1 : 0) - dockK.current) * Math.min(1, dt * 1.2)
        const dist = (36 + dockK.current * 14) * (0.35 + 0.65 * hullScale), cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch)
        // 平滑的是“跟随点”，镜头绕跟随点按角度摆放，避免环视时直线插值穿过船体
        follow.current.lerp(s.pos, snap.current ? 1 : 1 - Math.exp(-4 * dt))
        const f = follow.current
        desired.set(f.x - Math.sin(a) * dist * cp, f.y + 6.5 + dist * sp, f.z - Math.cos(a) * dist * cp)
        look.set(f.x + fwdX * 8 * (1 - dockK.current), f.y - 4 - dockK.current * 1, f.z + fwdZ * 8 * (1 - dockK.current))
        posK = lookK = 1
      } else if (view === 'bridge') {
        // 舰桥机位随船体俯仰 / 横滚一起摆动
        euler.set(s.pitch, s.yaw, s.roll, 'YXZ')
        tmp.copy(BRIDGE_EYE).multiplyScalar(hullScale).applyEuler(euler).add(s.pos)
        desired.copy(tmp)
        euler.set(s.pitch, s.yaw + orbit.yaw, s.roll, 'YXZ')
        look.set(0, -9 - orbit.pitch * 40, 50).applyEuler(euler).add(tmp)
        posK = lookK = 1
      } else {
        const a = clock.elapsedTime * 0.07 + orbit.yaw
        desired.set(s.pos.x + Math.sin(a) * 105, s.pos.y + 26 + orbit.pitch * 60, s.pos.z + Math.cos(a) * 105)
        look.set(s.pos.x, s.pos.y - 3, s.pos.z)
        posK = 1 - Math.exp(-1.5 * dt)
      }
      if (snap.current) { posK = lookK = 1; dockK.current = s.docked ? 1 : 0 }
    }
    snap.current = false
    camera.position.lerp(desired, posK)
    if (camera.position.y < CLOUD_TOP + 3) camera.position.y = CLOUD_TOP + 3
    camLook.current.lerp(look, lookK)
    camera.lookAt(camLook.current)
    // v1.2 瞄准方向：镜头朝向（补偿各视角的俯视角度）
    camera.getWorldDirection(tmp)
    arms.aimYaw = Math.atan2(tmp.x, tmp.z)
    arms.aimPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(tmp.y, -1, 1)) + (view === 'chase' ? 0.22 : view === 'far' ? 0.26 : 0.18), -0.6, 0.6)
    // 镜头震动：碰撞、雷击、雷暴湍流（设置中可关闭）
    if (screen === 'play' && useSettings.getState().shake) {
      const k = Math.min(1, ship.bump * 0.9 + env.flash * 0.35 + env.storm * 0.12 + arms.shake * 0.8) * (view === 'bridge' ? 0.5 : 1)
      if (k > 0.01) {
        const t = clock.elapsedTime
        camera.rotateX((Math.sin(t * 37) + Math.sin(t * 23.7)) * 0.004 * k)
        camera.rotateY((Math.sin(t * 29.3) + Math.sin(t * 41.1)) * 0.004 * k)
      }
    }
  })

  return (
    <>
      <Environment focus={focus} />
      <Islands />
      <Airship />
      <WindFx />
      <Beacons />
      <Hazards />
      <Combat />
      <FogBanks />
      <FrostFx />
    </>
  )
}
