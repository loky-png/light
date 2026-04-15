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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('light-token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = localStorage.getItem('light-user')
    return u ? JSON.parse(u) : null
  })
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<any[]>([])
  const [isValidating, setIsValidating] = useState(true)

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false)
        return
      }

      try {
        const lightAPI = (window as any).lightAPI
        const result = await lightAPI.fetch('http://155.212.167.68:80/api/auth/validate', {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!result.ok) {
          // Токен невалидный - выходим
          localStorage.removeItem('light-token')
          localStorage.removeItem('light-user')
          setToken(null)
          setUser(null)
        } else {
          // Загружаем список чатов
          loadChats()
        }
      } catch (err) {
        console.error('Token validation error:', err)
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [])

  const loadChats = async () => {
    try {
      const lightAPI = (window as any).lightAPI
      const result = await lightAPI.fetch('http://155.212.167.68:80/api/chats', {
        headers: { 'Authorization': `Bearer ${token}` }
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
    setToken(t)
    setUser(u)
    connectSocket(t)
  }

  const handleLogout = () => {
    localStorage.removeItem('light-token')
    localStorage.removeItem('light-user')
    setToken(null)
    setUser(null)
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
