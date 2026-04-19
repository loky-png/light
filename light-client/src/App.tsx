import { useEffect, useRef, useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import Login from './components/Login'
import { connectSocket, disconnectSocket } from './api/socket'
import { requestJson, requestRaw } from './api/http'
import type { AuthUser, ChatSummary, Message, SyncResponse, UserStatus } from './types'
import {
  clearStoredToken,
  clearStoredUser,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser
} from './utils/session'
import './App.css'

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function moveChatToTop(chats: ChatSummary[], chatId: string, update: (chat: ChatSummary) => ChatSummary): ChatSummary[] {
  const index = chats.findIndex((chat) => chat.id === chatId)
  if (index === -1) {
    return chats
  }

  const updatedChat = update(chats[index])
  const nextChats = chats.filter((chat) => chat.id !== chatId)
  return [updatedChat, ...nextChats]
}

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [isValidating, setIsValidating] = useState(true)
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({})
  const [messagesCache, setMessagesCache] = useState<Record<string, Message[]>>({})
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({})

  const selectedChatIdRef = useRef<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId
  }, [selectedChatId])

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null
  }, [user])

  const loadChats = async (authToken?: string) => {
    const currentToken = authToken || token
    if (!currentToken) {
      return
    }

    try {
      const data = await requestJson<SyncResponse>('/api/sync', {
        headers: { Authorization: `Bearer ${currentToken}` }
      })

      setChats(data.chats)
      setUserStatuses(data.userStatuses)
    } catch (error) {
      console.error('Load chats error:', error)
    }
  }

  useEffect(() => {
    const validateToken = async () => {
      const storedToken = getStoredToken()
      const storedUser = getStoredUser()

      if (!storedToken) {
        setIsValidating(false)
        return
      }

      try {
        const result = await requestRaw('/api/auth/validate', {
          headers: { Authorization: `Bearer ${storedToken}` }
        })

        if (!result.ok) {
          if (result.status === 401) {
            clearStoredToken()
            clearStoredUser()
            setToken(null)
            setUser(null)
          } else if (storedUser) {
            setToken(storedToken)
            setUser(storedUser)
          }

          return
        }

        const data = parseJson<{ valid: boolean; user: AuthUser }>(result.text)
        if (!data?.user) {
          clearStoredToken()
          clearStoredUser()
          setToken(null)
          setUser(null)
          return
        }

        setStoredUser(data.user)
        setToken(storedToken)
        setUser(data.user)
        await loadChats(storedToken)
      } catch (error) {
        console.error('Token validation error:', error)

        if (storedUser) {
          setToken(storedToken)
          setUser(storedUser)
        } else {
          clearStoredToken()
          clearStoredUser()
        }
      } finally {
        setIsValidating(false)
      }
    }

    void validateToken()
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    const socket = connectSocket(token)

    const handleMessageNew = (message: { chatId: string; text: string; createdAt: number; senderId: string }) => {
      setChats((previousChats) => moveChatToTop(previousChats, message.chatId, (chat) => {
        const isOwnMessage = message.senderId === currentUserIdRef.current
        const isCurrentChat = selectedChatIdRef.current === message.chatId

        return {
          ...chat,
          last_message: message.text,
          last_message_time: message.createdAt,
          unread: isOwnMessage || isCurrentChat ? 0 : chat.unread + 1
        }
      }))
    }

    const handleChatCreated = (chat: ChatSummary) => {
      setChats((previousChats) => previousChats.some((item) => item.id === chat.id) ? previousChats : [chat, ...previousChats])
    }

    const handleUserOnline = ({ userId, lastSeen }: { userId: string; lastSeen: number }) => {
      setUserStatuses((previous) => ({
        ...previous,
        [userId]: { status: 'online' as const, lastSeen }
      }))
    }

    const handleUserOffline = ({ userId, lastSeen }: { userId: string; lastSeen: number }) => {
      setUserStatuses((previous) => ({
        ...previous,
        [userId]: { status: 'recently' as const, lastSeen }
      }))
    }

    const handleMessagesRead = ({ chatId, userId }: { chatId: string; userId: string }) => {
      if (userId !== currentUserIdRef.current) {
        return
      }

      setChats((previousChats) => previousChats.map((chat) =>
        chat.id === chatId ? { ...chat, unread: 0 } : chat
      ))
    }

    const handleMessageDeleted = () => {
      void loadChats(token)
    }

    const handleReconnect = () => {
      void loadChats(token)
    }

    socket.on('message:new', handleMessageNew)
    socket.on('chat:created', handleChatCreated)
    socket.on('user:online', handleUserOnline)
    socket.on('user:offline', handleUserOffline)
    socket.on('messages:read', handleMessagesRead)
    socket.on('message:deleted', handleMessageDeleted)
    window.addEventListener('socket:reconnect', handleReconnect)

    void loadChats(token)

    const statusInterval = window.setInterval(() => {
      const now = Date.now()

      setUserStatuses((previous) => {
        const updated: Record<string, UserStatus> = { ...previous }

        for (const [userId, status] of Object.entries(updated)) {
          // Пропускаем пользователей которые онлайн - их статус обновляется через события
          if (status.status === 'online') {
            continue
          }

          const elapsed = now - status.lastSeen

          if (elapsed > 10_000 && elapsed < 300_000) {
            updated[userId] = { ...status, status: 'recently' }
          } else if (elapsed >= 300_000) {
            updated[userId] = { ...status, status: 'offline' }
          }
        }

        return updated
      })
    }, 5000)

    return () => {
      window.clearInterval(statusInterval)
      window.removeEventListener('socket:reconnect', handleReconnect)
      socket.off('message:new', handleMessageNew)
      socket.off('chat:created', handleChatCreated)
      socket.off('user:online', handleUserOnline)
      socket.off('user:offline', handleUserOffline)
      socket.off('messages:read', handleMessagesRead)
      socket.off('message:deleted', handleMessageDeleted)
    }
  }, [token])

  const handleChatCreated = (chat: ChatSummary) => {
    setChats((previousChats) => previousChats.some((item) => item.id === chat.id) ? previousChats : [chat, ...previousChats])
    setSelectedChatId(chat.id)
  }

  const handleChatDeleted = (chatId: string) => {
    setChats((previousChats) => previousChats.filter((chat) => chat.id !== chatId))
    setMessagesCache((previousCache) => {
      const nextCache = { ...previousCache }
      delete nextCache[chatId]
      return nextCache
    })

    if (selectedChatId === chatId) {
      setSelectedChatId(null)
    }
  }

  const handleLogin = (nextToken: string, nextUser: AuthUser) => {
    setStoredToken(nextToken)
    setStoredUser(nextUser)
    setToken(nextToken)
    setUser(nextUser)
    setSelectedChatId(null)
    setChats([])
    setUserStatuses({})
    setMessagesCache({})
  }

  const handleLogout = () => {
    clearStoredToken()
    clearStoredUser()
    disconnectSocket()
    setToken(null)
    setUser(null)
    setSelectedChatId(null)
    setChats([])
    setUserStatuses({})
    setMessagesCache({})
  }

  const handleMessagesLoaded = (chatId: string, messages: Message[]) => {
    setMessagesCache((previousCache) => ({
      ...previousCache,
      [chatId]: messages
    }))
  }

  const handleUpdateProfile = async (displayName: string, username: string, avatar: string | null) => {
    if (!user) {
      return
    }

    const updatedUser: AuthUser = {
      ...user,
      displayName,
      username,
      avatar
    }

    setUser(updatedUser)
    setStoredUser(updatedUser)
  }

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null

  if (isValidating) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-wallpaper)' }}>
            <span style={{ color: 'var(--text-primary)' }}>Загрузка...</span>
          </div>
        </ToastProvider>
      </ThemeProvider>
    )
  }

  if (!token || !user) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <Login onLogin={handleLogin} />
        </ToastProvider>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="app">
          <TitleBar username={user.displayName} />
          <div className="app-body">
            <Sidebar
              selectedChatId={selectedChatId}
              onSelectChat={setSelectedChatId}
              currentUser={user}
              onLogout={handleLogout}
              onUpdateProfile={handleUpdateProfile}
              chats={chats}
              onChatCreated={handleChatCreated}
              onChatDeleted={handleChatDeleted}
              token={token}
              userStatuses={userStatuses}
            />
            <main className="main">
              {selectedChat ? (
                <ChatWindow
                  chatId={selectedChat.id}
                  chatName={selectedChat.name || 'Чат'}
                  isOnline={userStatuses[selectedChat.otherUserId || '']?.status === 'online'}
                  userStatus={selectedChat.otherUserId ? userStatuses[selectedChat.otherUserId] : undefined}
                  currentUserId={user.id}
                  token={token}
                  cachedMessages={messagesCache[selectedChat.id]}
                  onMessagesLoaded={handleMessagesLoaded}
                  savedScrollPosition={scrollPositions[selectedChat.id]}
                  onScrollPositionChange={(position) => {
                    setScrollPositions(prev => ({ ...prev, [selectedChat.id]: position }))
                  }}
                />
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="5" fill="currentColor"/>
                      <path d="M12 1v3M12 20v3M23 12h-3M4 12H1M20.5 3.5l-2 2M5.5 18.5l-2 2M20.5 20.5l-2-2M5.5 5.5l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </span>
                  <p>Выберите чат, чтобы начать общение</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}
