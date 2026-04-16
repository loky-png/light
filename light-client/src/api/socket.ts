import { io, Socket } from 'socket.io-client'

const SERVER_URL = 'http://155.212.167.68:80'

let socket: Socket | null = null
let pingInterval: NodeJS.Timeout | null = null

export function connectSocket(token: string): Socket {
  // Отключаем старый socket если есть
  if (socket) {
    console.log('Disconnecting old socket')
    socket.disconnect()
    socket = null
  }

  // Очищаем старый интервал пинга
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }

  console.log('Connecting new socket with token:', token.substring(0, 20) + '...')
  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  })

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket?.id)
    // Уведомляем UI о подключении
    window.dispatchEvent(new CustomEvent('socket:connected'))
    
    // Переподключаемся ко всем чатам после reconnect
    const reconnectEvent = new CustomEvent('socket:reconnect')
    window.dispatchEvent(reconnectEvent)
    
    // Запускаем пинг каждые 30 секунд
    pingInterval = setInterval(() => {
      if (socket?.connected) {
        socket.emit('ping', Date.now())
      }
    }, 30000)
  })

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason)
    window.dispatchEvent(new CustomEvent('socket:disconnected', { detail: reason }))
    
    // Очищаем интервал пинга
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message)
    window.dispatchEvent(new CustomEvent('socket:error', { detail: error.message }))
  })

  socket.on('pong', (timestamp: number) => {
    const latency = Date.now() - timestamp
    console.log('🏓 Pong received, latency:', latency + 'ms')
  })

  socket.on('message:new', (msg: any) => {
    console.log('📨 New message:', msg)
  })

  // Сохраняем socket глобально для доступа из компонентов
  ;(window as any).socket = socket

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
    ;(window as any).socket = null
  }
}

export const API_URL = SERVER_URL
