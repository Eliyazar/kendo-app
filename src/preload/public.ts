import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PublicBridge } from '@shared/ipc'
import type { PublicView } from '@shared/public-view'

// Read-only: the public window can subscribe but never dispatch.
const bridge: PublicBridge = {
  getView: () => ipcRenderer.invoke(IPC.publicGetView),
  onView: (listener) => {
    const handler = (_e: IpcRendererEvent, view: PublicView): void => listener(view)
    ipcRenderer.on(IPC.publicView, handler)
    return () => ipcRenderer.removeListener(IPC.publicView, handler)
  },
  onBuzzer: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(IPC.publicBuzzer, handler)
    return () => ipcRenderer.removeListener(IPC.publicBuzzer, handler)
  }
}

contextBridge.exposeInMainWorld('kendoPublic', bridge)
