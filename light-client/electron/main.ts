import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import axios from 'axios'

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
  })

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.openDevTools({ mode: 'detach' })

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
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
