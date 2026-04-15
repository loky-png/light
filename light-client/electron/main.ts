import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import http from 'http'

function httpRequest(url: string, options: RequestInit): Promise<{ok: boolean, status: number, text: string}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const body = options.body as string
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 3000,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body || ''),
        ...(options.headers as Record<string, string>),
      },
    }
    const req = http.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ ok: (res.statusCode || 500) < 400, status: res.statusCode || 500, text: data }))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
    if (body) req.write(body)
    req.end()
  })
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
