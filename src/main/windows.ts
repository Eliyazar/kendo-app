import { join } from 'node:path'
import { BrowserWindow, screen, shell, type BrowserWindowConstructorOptions } from 'electron'

type Page = 'admin' | 'public'

function secureDefaults(page: Page): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, `../preload/${page}.js`),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false
  }
}

function loadPage(win: BrowserWindow, page: Page): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** Keep windows on our own pages: no navigation, no popups. */
function lockDown(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

export function createAdminWindow(): BrowserWindow {
  const win = new BrowserWindow({
    title: 'Kendo Tournament Manager — Admin',
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: secureDefaults('admin')
  })
  lockDown(win)
  win.once('ready-to-show', () => win.show())
  loadPage(win, 'admin')
  return win
}

/**
 * The public scoreboard goes fullscreen on the first external display
 * (TV / projector). Without one it opens as a normal window next to the admin.
 */
export function createPublicWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay()
  const external = screen.getAllDisplays().find((d) => d.id !== primary.id)
  const bounds = external?.bounds ?? { x: primary.workArea.x + 60, y: primary.workArea.y + 60, width: 1280, height: 720 }

  const win = new BrowserWindow({
    title: 'Kendo Scoreboard',
    ...bounds,
    fullscreen: Boolean(external),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: secureDefaults('public')
  })
  win.setMenuBarVisibility(false)
  lockDown(win)
  win.once('ready-to-show', () => win.showInactive())
  loadPage(win, 'public')
  return win
}
