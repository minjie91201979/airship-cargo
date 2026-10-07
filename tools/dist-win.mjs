/**
 * Windows 打包：先输出到 %LOCALAPPDATA%\ac-build\release，再把 exe 复制到项目的 release\。
 * 原因：项目放在桌面等受保护 / 被杀毒实时扫描的目录时，electron-builder 重命名 win-unpacked.tmp 会报 EPERM。
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stage = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'ac-build', 'release')
const out = path.join(root, 'release')
fs.rmSync(stage, { recursive: true, force: true })
execSync(`npx electron-builder --win portable nsis --x64 "--config.directories.output=${stage}"`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
})
fs.mkdirSync(out, { recursive: true })
for (const f of fs.readdirSync(stage)) {
  if (!f.endsWith('.exe')) continue
  fs.copyFileSync(path.join(stage, f), path.join(out, f))
  console.log(`→ ${path.join(out, f)}  ${(fs.statSync(path.join(out, f)).size / 1048576).toFixed(1)} MB`)
}
