import { io, Socket } from 'socket.io-client'

const SERVER_URL = 'http://155.212.167.68:80'

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  // Отключаем старый socket если есть
  if (socket) {
    console.log('Disconnecting old socket')
    socket.disconnect()
    socket = null
  }

  console.log('Connecting new socket with token:', token.substring(0, 20) + '...')
  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id)
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
  })

  socket.on('message:new', (msg: any) => {
    console.log('New message:', msg)
  })

  // Сохраняем socket глобально для доступа из компонентов
  ;(window as any).socket = socket

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    ;(window as any).socket = null
  }
}

export const API_URL = SERVER_URL
