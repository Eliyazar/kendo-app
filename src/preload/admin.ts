import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type AdminBridge, type AdminSnapshot } from '@shared/ipc'

const bridge: AdminBridge = {
  dispatch: (action) => ipcRenderer.invoke(IPC.adminDispatch, action),
  getState: () => ipcRenderer.invoke(IPC.adminGetState),
  onState: (listener) => {
    const handler = (_e: IpcRendererEvent, snapshot: AdminSnapshot): void => listener(snapshot)
    ipcRenderer.on(IPC.adminState, handler)
    return () => ipcRenderer.removeListener(IPC.adminState, handler)
  }
}

contextBridge.exposeInMainWorld('kendoAdmin', bridge)
