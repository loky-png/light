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
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('light-token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = localStorage.getItem('light-user')
    return u ? JSON.parse(u) : null
  })
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)

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
        <TitleBar onLogout={handleLogout} username={user.displayName} />
        <div className="app-body">
          <Sidebar selectedChatId={selectedChatId} onSelectChat={setSelectedChatId} />
          <main className="main">
            {selectedChatId ? (
              <ChatWindow
                chatId={selectedChatId}
                chatName={selectedChatId}
                isOnline={false}
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
