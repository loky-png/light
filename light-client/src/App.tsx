import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import Login from './components/Login'
import { connectSocket } from './api/socket'
import './App.css'

interface AuthUser {
  id: string
  username: string
  displayName: string
  avatar?: string | null
}

export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<any[]>([])
  const [isValidating, setIsValidating] = useState(true)
  const [userStatuses, setUserStatuses] = useState<Record<string, { status: string; lastSeen: number }>>({})
  const [messagesCache, setMessagesCache] = useState<Record<string, any[]>>({}) // Кеш сообщений по chatId

  useEffect(() => {
    const validateToken = async () => {
      // Читаем ТОЛЬКО токен из localStorage
      const storedToken = localStorage.getItem('light-token')
      
      if (!storedToken) {
        setIsValidating(false)
        return
      }

      try {
        const lightAPI = (window as any).lightAPI
        const result = await lightAPI.fetch('http://155.212.167.68:80/api/auth/validate', {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        })

        if (!result.ok) {
          // Токен невалидный - выходим
          localStorage.removeItem('light-token')
          setToken(null)
          setUser(null)
        } else {
          // Токен валидный - получаем данные пользователя с СЕРВЕРА
          const data = JSON.parse(result.text)
          console.log('User data from server:', data.user)
          setToken(storedToken)
          setUser(data.user)
          // Загружаем список чатов
          loadChats(storedToken)
        }
      } catch (err) {
        console.error('Token validation error:', err)
        // НЕ удаляем токен при ошибке соединения - оставляем пользователя залогиненным
        // Просто показываем что валидация не удалась
        if (storedToken) {
          setToken(storedToken)
          // Пытаемся загрузить данные из кеша или показать оффлайн режим
        }
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [])

  const loadChats = async (authToken?: string) => {
    try {
      const lightAPI = (window as any).lightAPI
      const tkn = authToken || token
      if (!tkn) return
      
      // Используем новый /api/sync endpoint - получаем все данные одним запросом
      const result = await lightAPI.fetch('http://155.212.167.68:80/api/sync', {
        headers: { 'Authorization': `Bearer ${tkn}` }
      })
      
      if (result.ok) {
        const data = JSON.parse(result.text)
        console.log('[App] Synced data:', data)
        setChats(data.chats)
        setUserStatuses(data.userStatuses)
      }
    } catch (err) {
      console.error('Load chats error:', err)
    }
  }

  const handleChatCreated = (chat: any) => {
    // Проверяем что чата еще нет в списке
    const exists = chats.find(c => c.id === chat.id)
    if (!exists) {
      setChats(prev => [chat, ...prev])
    }
    setSelectedChatId(chat.id)
  }

  const handleChatDeleted = (chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId))
    if (selectedChatId === chatId) {
      setSelectedChatId(null)
    }
  }

  useEffect(() => {
    if (token) {
      connectSocket(token)
      // Загружаем чаты сразу после подключения socket
      loadChats()
      
      // Подписываемся на обновления чатов через socket
      const socket = (window as any).socket
      if (socket) {
        // Новое сообщение - обновляем превью
        socket.on('message:new', (msg: any) => {
          // Обновляем только превью последнего сообщения в списке чатов
          setChats(prev => prev.map(chat => {
            if (chat.id === msg.chatId) {
              return {
                ...chat,
                last_message: msg.text,
                last_message_time: Math.floor(msg.createdAt / 1000)
              }
            }
            return chat
          }))
        })
        
        // Новый чат создан - добавляем в список
        socket.on('chat:created', (chat: any) => {
          console.log('New chat created:', chat)
          setChats(prev => {
            // Проверяем что чата еще нет
            if (prev.some(c => c.id === chat.id)) {
              return prev
            }
            return [chat, ...prev]
          })
        })
        
        // Отслеживаем онлайн статус
        socket.on('user:online', ({ userId, lastSeen }: { userId: string; lastSeen: number }) => {
          console.log('User online:', userId)
          setUserStatuses(prev => ({
            ...prev,
            [userId]: { status: 'online', lastSeen }
          }))
        })
        
        socket.on('user:offline', ({ userId, lastSeen }: { userId: string; lastSeen: number }) => {
          console.log('User offline:', userId)
          setUserStatuses(prev => ({
            ...prev,
            [userId]: { status: 'recently', lastSeen }
          }))
        })
        
        // Обновляем счетчик непрочитанных при прочтении
        socket.on('messages:read', ({ chatId }: { chatId: string }) => {
          setChats(prev => prev.map(chat => 
            chat.id === chatId ? { ...chat, unread: 0 } : chat
          ))
        })
      }
      
      // Обновляем статусы каждые 5 секунд
      const statusInterval = setInterval(() => {
        const now = Date.now()
        setUserStatuses(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(userId => {
            const timeSince = now - updated[userId].lastSeen
            if (timeSince > 10000 && timeSince < 300000) {
              updated[userId].status = 'recently'
            } else if (timeSince >= 300000) {
              updated[userId].status = 'offline'
            }
          })
          return updated
        })
      }, 5000)
      
      return () => clearInterval(statusInterval)
    }
  }, [token])

  const handleLogin = (t: string, u: AuthUser) => {
    // Сохраняем ТОЛЬКО токен в localStorage
    localStorage.setItem('light-token', t)
    
    console.log('Login successful, user from server:', u)
    setToken(t)
    setUser(u)
    setSelectedChatId(null)
    setChats([])
    
    // Переподключаем socket с новым токеном
    const oldSocket = (window as any).socket
    if (oldSocket) {
      oldSocket.disconnect()
    }
    connectSocket(t)
  }

  const handleLogout = () => {
    // Очищаем ТОЛЬКО токен
    localStorage.removeItem('light-token')
    
    // Отключаем socket
    const socket = (window as any).socket
    if (socket) {
      socket.disconnect()
      ;(window as any).socket = null
    }
    
    setToken(null)
    setUser(null)
    setSelectedChatId(null)
    setChats([])
  }

  const handleMessagesLoaded = (chatId: string, messages: any[]) => {
    setMessagesCache(prev => ({
      ...prev,
      [chatId]: messages
    }))
  }

  const handleUpdateProfile = async (displayName: string, username: string, avatar: string | null) => {
    // Обновляем состояние локально
    setUser({ ...user!, displayName, username, avatar })
  }

  if (isValidating) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
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
              {selectedChatId ? (
                <ChatWindow
                  chatId={selectedChatId}
                  chatName={chats.find(c => c.id === selectedChatId)?.name || 'Чат'}
                  isOnline={userStatuses[chats.find(c => c.id === selectedChatId)?.otherUserId || '']?.status === 'online'}
                  userStatus={userStatuses[chats.find(c => c.id === selectedChatId)?.otherUserId || '']}
                  onMessageSent={() => {}}
                  currentUserId={user.id}
                  token={token}
                  cachedMessages={messagesCache[selectedChatId]}
                  onMessagesLoaded={handleMessagesLoaded}
                />
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">☀</span>
                  <p>Выберите чат чтобы начать общение</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}
