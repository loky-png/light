import { useState } from 'react'
import type { Chat } from '../types'
import { useTheme } from '../context/ThemeContext'
import './Sidebar.css'

// Mock data для разработки UI
const MOCK_CHATS: Chat[] = [
  {
    id: '1',
    name: 'Алексей',
    isOnline: true,
    unreadCount: 3,
    participants: [],
    lastMessage: {
      id: 'm1', chatId: '1', senderId: '2',
      text: 'Привет, как дела?',
      createdAt: new Date(), read: false
    }
  },
  {
    id: '2',
    name: 'Мария',
    isOnline: false,
    unreadCount: 0,
    participants: [],
    lastMessage: {
      id: 'm2', chatId: '2', senderId: '3',
      text: 'Окей, договорились',
      createdAt: new Date(Date.now() - 3600000), read: true
    }
  },
  {
    id: '3',
    name: 'Группа разработчиков',
    isOnline: false,
    unreadCount: 12,
    participants: [],
    lastMessage: {
      id: 'm3', chatId: '3', senderId: '4',
      text: 'Деплой прошёл успешно',
      createdAt: new Date(Date.now() - 7200000), read: false
    }
  },
]

interface SidebarProps {
  selectedChatId: string | null
  onSelectChat: (id: string) => void
}

function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 86400000) {
    return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar({ selectedChatId, onSelectChat }: SidebarProps) {
  const [search, setSearch] = useState('')
  const { theme, toggleTheme } = useTheme()

  const filtered = MOCK_CHATS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">☀ Light</span>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? '🌙' : '☀️'}
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Поиск"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <ul className="chat-list">
        {filtered.map(chat => (
          <li
            key={chat.id}
            className={`chat-item ${selectedChatId === chat.id ? 'active' : ''}`}
            onClick={() => onSelectChat(chat.id)}
          >
            <div className="chat-avatar">
              {getInitials(chat.name)}
              {chat.isOnline && <span className="online-dot" />}
            </div>
            <div className="chat-info">
              <div className="chat-top">
                <span className="chat-name">{chat.name}</span>
                {chat.lastMessage && (
                  <span className="chat-time">
                    {formatTime(chat.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="chat-bottom">
                <span className="chat-preview">
                  {chat.lastMessage?.text ?? ''}
                </span>
                {chat.unreadCount > 0 && (
                  <span className="unread-badge">{chat.unreadCount}</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
