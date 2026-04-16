export interface User {
  id: string
  username: string
  displayName: string
  avatar?: string
  online: boolean
  lastSeen?: Date
}

export interface Message {
  id: string
  chatId: string
  senderId: string
  text: string
  createdAt: Date
  read: boolean
  replyTo?: {
    id: string
    senderId: string
    senderName: string
    text: string
  }
}

export interface Chat {
  id: string
  name: string
  avatar?: string
  lastMessage?: Message
  unreadCount: number
  isOnline: boolean
  participants: User[]
}

export type Theme = 'dark' | 'light'
