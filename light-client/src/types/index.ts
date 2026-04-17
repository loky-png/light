export interface AuthUser {
  id: string
  username: string
  displayName: string
  avatar?: string | null
}

export type PresenceStatus = 'online' | 'recently' | 'offline'

export interface UserStatus {
  status: PresenceStatus
  lastSeen: number
}

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
  deleted?: boolean
  replyTo?: {
    id: string
    senderId: string
    senderName: string
    text: string
  }
}

export interface ChatSummary {
  id: string
  name: string | null
  type: string
  avatar?: string | null
  last_message: string | null
  last_message_time: number | null
  unread: number
  otherUserId?: string
}

export interface SyncResponse {
  chats: ChatSummary[]
  userStatuses: Record<string, UserStatus>
  timestamp: number
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
