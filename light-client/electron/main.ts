import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import axios from 'axios'
import { autoUpdater } from 'electron-updater'

// FIX: URL обновлений из переменной окружения, не хардкод
const SERVER_URL = process.env.SERVER_URL ?? 'http://155.212.167.68:80'

autoUpdater.setFeedURL({
  provider: 'generic',
  url: `${SERVER_URL}/updates/`
})

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

async function httpRequest(
  url: string,
  options: RequestInit
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const response = await axios({
      url,
      method: (options.method as string) || 'GET',
      data: options.body ? (JSON.parse(options.body as string) as unknown) : undefined,
      headers: options.headers as Record<string, string>,
      timeout: 10000,
    })
    return { ok: true, status: response.status, text: JSON.stringify(response.data) }
  } catch (error: unknown) {
    const axiosError = error as { response?: { status: number; data: unknown }; message: string }
    if (axiosError.response) {
      return {
        ok: false,
        status: axiosError.response.status,
        text: JSON.stringify(axiosError.response.data)
      }
    }
    console.error('[Main] Request failed:', axiosError.message)
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
      // FIX: webSecurity включён — отключение было серьёзной уязвимостью
      webSecurity: true,
    },
  })

  win.setBackgroundColor('#17212b')
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // FIX: DevTools открываются только в режиме разработки
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.log('Update check failed:', err)
    })
  }, 3000)

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update-available', info)
  })

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('download-progress', progress)
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update-downloaded', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err)
  })

  ipcMain.on('download-update', () => { autoUpdater.downloadUpdate() })
  ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(false, true) })
  ipcMain.on('window-minimize', () => win.minimize())
  ipcMain.on('window-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
  ipcMain.on('window-close', () => win.close())

  // HTTP прокси для Electron (обход ограничений CORS/WebSecurity)
  ipcMain.handle('fetch', async (_event, url: string, options: RequestInit) => {
    try {
      return await httpRequest(url, options)
    } catch (e) {
      console.error('Fetch error:', e)
      throw e
    }
  })

  // FIX: убран дублирующий IPC-обработчик update-profile
  // (профиль обновляется через стандартный ipcMain.handle('fetch', ...))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
