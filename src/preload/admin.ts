import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AdminBridge, type AdminSnapshot } from '@shared/ipc'

const bridge: AdminBridge = {
  dispatch: (action) => ipcRenderer.invoke(IPC.adminDispatch, action),
  getState: () => ipcRenderer.invoke(IPC.adminGetState),
  importParticipants: () => ipcRenderer.invoke(IPC.adminImport),
  setSettings: (patch) => ipcRenderer.invoke(IPC.adminSetSettings, patch),
  exportResults: () => ipcRenderer.invoke(IPC.adminExport),
  openFolder: (folder) => ipcRenderer.invoke(IPC.adminOpenFolder, folder),
  onState: (listener) => {
    const handler = (_e: IpcRendererEvent, snapshot: AdminSnapshot): void => listener(snapshot)
    ipcRenderer.on(IPC.adminState, handler)
    return () => ipcRenderer.removeListener(IPC.adminState, handler)
  }
}

contextBridge.exposeInMainWorld('kendoAdmin', bridge)
