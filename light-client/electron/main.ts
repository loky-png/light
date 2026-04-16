import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import axios from 'axios'
import { autoUpdater } from 'electron-updater'

// Настройка автообновления
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'http://155.212.167.68:80/updates/'
})

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// НЕ создаем уникальный ID - используем общую папку для сохранения данных
// Это позволит сохранять токен между запусками приложения

async function httpRequest(url: string, options: RequestInit): Promise<{ok: boolean, status: number, text: string}> {
  try {
    console.log('[Main] Axios request:', url, options.method)
    const response = await axios({
      url,
      method: options.method as any || 'GET',
      data: options.body ? JSON.parse(options.body as string) : undefined,
      headers: options.headers as any,
      timeout: 10000,
    })
    console.log('[Main] Response:', response.status, response.data)
    return { ok: true, status: response.status, text: JSON.stringify(response.data) }
  } catch (error: any) {
    if (error.response) {
      console.log('[Main] Error response:', error.response.status, error.response.data)
      return { ok: false, status: error.response.status, text: JSON.stringify(error.response.data) }
    }
    console.error('[Main] Request failed:', error.message)
    throw error
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#17212b',
    title: 'Light',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
  })

  // Отключаем анимацию ресайза для плавности
  win.setBackgroundColor('#17212b')

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  
  // Всегда открываем DevTools
  win.webContents.openDevTools({ mode: 'detach' })

  // Проверка обновлений при запуске
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Update check failed:', err)
    })
  }, 3000)

  // События автообновления
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version)
    win.webContents.send('update-available', info)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('No updates available')
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log('Download progress:', progress.percent)
    win.webContents.send('download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version)
    win.webContents.send('update-downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
    // Не крашим приложение при ошибке обновления
  })

  // IPC для управления обновлениями
  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.on('window-minimize', () => win.minimize())
  ipcMain.on('window-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.on('window-close', () => win.close())

  // Проксируем HTTP запросы через main process
  ipcMain.handle('fetch', async (_event, url: string, options: RequestInit) => {
    try {
      console.log('Fetching:', url)
      const result = await httpRequest(url, options)
      console.log('Response:', result.status, result.text.slice(0, 100))
      return result
    } catch (e) {
      console.error('Fetch error:', e)
      throw e
    }
  })

  // Обновление профиля
  ipcMain.handle('update-profile', async (_event, token: string, data: { displayName: string; username: string; avatar: string | null }) => {
    try {
      const url = 'http://155.212.167.68:80/api/profile'
      console.log('[Main] Update profile:', url, data.displayName, data.username)
      const result = await httpRequest(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      })
      return result
    } catch (e) {
      console.error('[Main] Profile update error:', e)
      throw e
    }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
