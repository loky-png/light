import { io, Socket } from 'socket.io-client'
import { API_URL } from '../config'

let socket: Socket | null = null
// FIX: правильный тип для браузерного setInterval (number, не NodeJS.Timeout)
let pingInterval: number | null = null

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect()
    socket = null
  }

  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  })

  socket.on('connect', () => {
    window.dispatchEvent(new CustomEvent('socket:connected'))
    window.dispatchEvent(new CustomEvent('socket:reconnect'))

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
    console.error('Socket connection error:', error.message)
    window.dispatchEvent(new CustomEvent('socket:error', { detail: error.message }))
  })

  socket.on('error', (payload) => {
    const message = typeof payload?.message === 'string' ? payload.message : 'Socket error'
    window.dispatchEvent(new CustomEvent('socket:error', { detail: message }))
  })

  // FIX: удалён дублирующий глобальный обработчик message:new
  // (он был только для console.log и конфликтовал с обработчиком в ChatWindow)

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
