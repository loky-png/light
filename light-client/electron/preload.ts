import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('lightAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  // Проксируем fetch через main process чтобы обойти блокировку
  fetch: async (url: string, options: RequestInit) => {
    return await ipcRenderer.invoke('fetch', url, options)
  },
  // Обновление профиля
  updateProfile: async (token: string, data: { displayName: string; username: string; avatar: string | null }) => {
    return await ipcRenderer.invoke('update-profile', token, data)
  },
})
