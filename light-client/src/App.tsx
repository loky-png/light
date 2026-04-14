import { useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import './App.css'

const MOCK_CHATS = [
  { id: '1', name: 'Алексей', isOnline: true },
  { id: '2', name: 'Мария', isOnline: false },
  { id: '3', name: 'Группа разработчиков', isOnline: false },
]

export default function App() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>('1')
  const selectedChat = MOCK_CHATS.find(c => c.id === selectedChatId)

  return (
    <ThemeProvider>
      <div className="app">
        <TitleBar />
        <div className="app-body">
          <Sidebar selectedChatId={selectedChatId} onSelectChat={setSelectedChatId} />
          <main className="main">
            {selectedChat ? (
              <ChatWindow
                chatId={selectedChat.id}
                chatName={selectedChat.name}
                isOnline={selectedChat.isOnline}
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
