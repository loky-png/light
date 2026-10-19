import { io, Socket } from 'socket.io-client'
import { API_URL } from '../config'

let socket: Socket | null = null
let pingInterval: number | null = null
let connectErrorCount = 0

// После 5 connect_error подряд (~15 сек) считаем сервер мёртвым
const MAX_CONNECT_ERRORS = 5

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect()
    socket = null
  }

  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  connectErrorCount = 0

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  })

  socket.on('connect', () => {
    // Успешное подключение — сбрасываем счётчик ошибок
    connectErrorCount = 0
    window.dispatchEvent(new CustomEvent('socket:connected'))
    window.dispatchEvent(new CustomEvent('socket:reconnect'))

    if (pingInterval) {
      clearInterval(pingInterval)
    }
    pingInterval = window.setInterval(() => {
      if (socket?.connected) {
        socket.emit('ping', Date.now())
      }
    }, 30000)
  })

  socket.on('disconnect', (reason) => {
    window.dispatchEvent(new CustomEvent('socket:disconnected', { detail: reason }))

    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  })

  socket.on('connect_error', (error) => {
    connectErrorCount++
    console.error(`Socket connect_error (${connectErrorCount}/${MAX_CONNECT_ERRORS}):`, error.message)
    window.dispatchEvent(new CustomEvent('socket:error', { detail: error.message }))

    if (connectErrorCount >= MAX_CONNECT_ERRORS) {
      // Сервер недоступен — уведомляем приложение
      window.dispatchEvent(new CustomEvent('socket:server_down'))
    }
  })

  socket.on('error', (payload) => {
    const message = typeof payload?.message === 'string' ? payload.message : 'Socket error'
    window.dispatchEvent(new CustomEvent('socket:error', { detail: message }))
  })

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  if (socket) {
    socket.disconnect()
    socket = null
  }
}
