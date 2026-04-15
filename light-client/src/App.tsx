import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
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

  useEffect(() => {
    const validateToken = async () => {
      // Читаем данные из localStorage при загрузке
      const storedToken = localStorage.getItem('light-token')
      const storedUser = localStorage.getItem('light-user')
      
      if (!storedToken || !storedUser) {
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
          localStorage.clear()
          setToken(null)
          setUser(null)
        } else {
          // Токен валидный - устанавливаем состояние
          setToken(storedToken)
          setUser(JSON.parse(storedUser))
          // Загружаем список чатов
          loadChats(storedToken)
        }
      } catch (err) {
        console.error('Token validation error:', err)
        localStorage.clear()
        setToken(null)
        setUser(null)
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
      
      const result = await lightAPI.fetch('http://155.212.167.68:80/api/chats', {
        headers: { 'Authorization': `Bearer ${tkn}` }
      })
      
      if (result.ok) {
        const chatList = JSON.parse(result.text)
        setChats(chatList)
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
    if (token) connectSocket(token)
  }, [token])

  const handleLogin = (t: string, u: AuthUser) => {
    // Полностью очищаем старые данные
    localStorage.clear()
    
    // Сохраняем новые данные
    localStorage.setItem('light-token', t)
    localStorage.setItem('light-user', JSON.stringify(u))
    
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
    // Полностью очищаем localStorage
    localStorage.clear()
    
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

  const handleUpdateProfile = async (displayName: string, username: string, avatar: string | null) => {
    try {
      const lightAPI = (window as any).lightAPI
      if (!lightAPI?.updateProfile) {
        const error = 'Ошибка: API недоступен'
        alert(error)
        throw new Error(error)
      }

      console.log('Updating profile:', { displayName, username, hasAvatar: !!avatar })
      const result = await lightAPI.updateProfile(token, { displayName, username, avatar })
      console.log('Update result:', result)
      
      if (!result.ok) {
        const error = JSON.parse(result.text)
        alert(error.error || 'Ошибка обновления профиля')
        throw new Error(error.error || 'Update failed')
      }

      const data = JSON.parse(result.text)
      const updatedUser = data.user
      setUser(updatedUser)
      localStorage.setItem('light-user', JSON.stringify(updatedUser))
      console.log('Profile updated successfully:', updatedUser)
    } catch (err) {
      console.error('Profile update error:', err)
      alert('Ошибка соединения с сервером')
      throw err
    }
  }

  if (isValidating) {
    return (
      <ThemeProvider>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
          <span style={{ color: 'var(--text-primary)' }}>Загрузка...</span>
        </div>
      </ThemeProvider>
    )
  }

  if (!token || !user) {
    return (
      <ThemeProvider>
        <Login onLogin={handleLogin} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
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
          />
          <main className="main">
            {selectedChatId ? (
              <ChatWindow
                chatId={selectedChatId}
                chatName={chats.find(c => c.id === selectedChatId)?.name || 'Чат'}
                isOnline={false}
                onMessageSent={loadChats}
                currentUserId={user.id}
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
    </ThemeProvider>
  )
}
