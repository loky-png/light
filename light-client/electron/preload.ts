import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lightAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // Проксируем fetch через main process чтобы обойти блокировку
  fetch: async (url: string, options: RequestInit) => {
    return await ipcRenderer.invoke('fetch', url, options)
  },
})
