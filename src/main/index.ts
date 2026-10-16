import { app, BrowserWindow, Menu } from 'electron'
import { StateFile } from './persistence'
import { Store } from './store'
import { broadcast, registerIpc, type WindowRefs } from './ipc'
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

// One instance only: two copies would fight over the state file.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (adminWindow) {
      if (adminWindow.isMinimized()) adminWindow.restore()
      adminWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const file = new StateFile(app.getPath('userData'))
    const store: Store = new Store(file, () => broadcast(store, windows))
    registerIpc(store, windows, !app.isPackaged)
    store.start()

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

    app.on('before-quit', () => store.stop())
  })

  app.on('window-all-closed', () => app.quit())
}
