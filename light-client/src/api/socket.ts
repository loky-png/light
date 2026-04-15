import { io, Socket } from 'socket.io-client'

const SERVER_URL = 'http://155.212.167.68:80'

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket

  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
  })

  socket.on('message:new', (msg: any) => {
    console.log('New message:', msg)
    // Сохраняем socket глобально для доступа из компонентов
    ;(window as any).socket = socket
  })

  ;(window as any).socket = socket

  return socket
}

export function getSocket(): Socket | null {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export const API_URL = SERVER_URL
