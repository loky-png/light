import { contextBridge, ipcRenderer } from 'electron'

// Безопасный мост между renderer и main процессом
contextBridge.exposeInMainWorld('lightAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
})
