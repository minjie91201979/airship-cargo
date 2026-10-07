/**
 * 云港航运 · Electron 主进程
 * - 加载打包好的 dist/index.html（file 协议，vite base 为 './'）
 * - 无菜单栏，F11 切换全屏
 * - localStorage 存档保存在 app.getPath('userData') 下（Electron 默认行为），卸载/更新 exe 不会丢失
 */
const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')

app.setName('AirshipCargo')
// 存档目录固定在 %APPDATA%/AirshipCargo，便携版每次解压到不同临时目录也能读到同一份存档
app.setPath('userData', path.join(app.getPath('appData'), 'AirshipCargo'))
Menu.setApplicationMenu(null)

const single = app.requestSingleInstanceLock()
if (!single) app.quit()

let win = null
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '云港航运',
    backgroundColor: '#1d1712',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  })
  win.setMenuBarVisibility(false)
  // 保持窗口标题为「云港航运」
  win.on('page-title-updated', (e) => e.preventDefault())
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen())
      e.preventDefault()
    }
  })
  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
  // 照相模式截图：直接存到「图片/云港航运」，不弹保存对话框
  win.webContents.session.on('will-download', (_e, item) => {
    const dir = path.join(app.getPath('pictures'), '云港航运')
    try { require('fs').mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
    item.setSavePath(path.join(dir, item.getFilename()))
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.once('ready-to-show', () => win.show())
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
