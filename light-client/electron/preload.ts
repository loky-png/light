import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lightAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // Проксируем fetch через main process чтобы обойти блокировку
  fetch: async (url: string, options: RequestInit) => {
    const result = await ipcRenderer.invoke('fetch', url, options)
    return {
      ok: result.ok,
      status: result.status,
      json: async () => JSON.parse(result.text),
      text: async () => result.text,
    }
  },
})
