import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import { AppContext } from './context'
import { parseAdminAction, registerIpc, type WindowRefs } from './ipc'
import { StateFile } from './persistence'
import { SettingsFile } from './settings'
import { createAdminWindow, createPublicWindow } from './windows'

let adminWindow: BrowserWindow | null = null
let publicWindow: BrowserWindow | null = null

const windows: WindowRefs = {
  admin: () => adminWindow,
  public: () => publicWindow
}

function openPublicWindow(): void {
  if (publicWindow && !publicWindow.isDestroyed()) {
    publicWindow.show()
    return
  }
  publicWindow = createPublicWindow()
  publicWindow.on('closed', () => (publicWindow = null))
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Scoreboard',
        submenu: [
          { label: 'Open Public Scoreboard', accelerator: 'CmdOrCtrl+Shift+P', click: openPublicWindow },
          {
            label: 'Toggle Public Fullscreen',
            accelerator: 'CmdOrCtrl+Shift+F',
            click: () => publicWindow?.setFullScreen(!publicWindow.isFullScreen())
          }
        ]
      },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ])
  )
}

// Optional separate data folder, e.g. to rehearse a tournament next to a live one.
const profileDir = process.env['KENDO_PROFILE_DIR']
if (profileDir) {
  mkdirSync(profileDir, { recursive: true })
  app.setPath('userData', profileDir)
}

// One instance per data folder: two copies would fight over the state file.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (adminWindow) {
      if (adminWindow.isMinimized()) adminWindow.restore()
      adminWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    const dir = app.getPath('userData')
    const ctx = new AppContext(
      new StateFile(dir),
      new SettingsFile(dir),
      windows,
      !app.isPackaged,
      { rendererDir: join(__dirname, '../renderer'), devUrl: process.env['ELECTRON_RENDERER_URL'] },
      parseAdminAction
    )
    registerIpc(ctx, windows)
    await ctx.start()

    buildMenu()
    adminWindow = createAdminWindow()
    // The admin panel is the app: closing it quits, including the public screen.
    adminWindow.on('closed', () => {
      adminWindow = null
      app.quit()
    })
    openPublicWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) adminWindow = createAdminWindow()
    })

    app.on('before-quit', () => ctx.stop())
  })

  app.on('window-all-closed', () => app.quit())
}
