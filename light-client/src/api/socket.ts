import { io, Socket } from 'socket.io-client'

const SERVER_URL = 'http://155.212.167.68:3000'

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket

  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
  })

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
