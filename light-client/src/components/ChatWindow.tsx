import { useState, useRef, useEffect } from 'react'
import type { Message } from '../types'
import './ChatWindow.css'

const t = (minAgo: number) => new Date(Date.now() - minAgo * 60000)

const MOCK_MESSAGES: Record<string, Message[]> = {
  '1': [
    { id: '1-1', chatId: '1', senderId: '2', text: 'Привет! Как дела?', createdAt: t(60), read: true },
    { id: '1-2', chatId: '1', senderId: 'me', text: 'Всё отлично, работаю над проектом 🔥', createdAt: t(58), read: true },
    { id: '1-3', chatId: '1', senderId: '2', text: 'Над каким?', createdAt: t(55), read: true },
    { id: '1-4', chatId: '1', senderId: 'me', text: 'Делаю свой мессенджер на Electron + React + TypeScript', createdAt: t(50), read: true },
    { id: '1-5', chatId: '1', senderId: '2', text: 'Серьёзно? Как называется?', createdAt: t(45), read: true },
    { id: '1-6', chatId: '1', senderId: 'me', text: 'Light ☀️', createdAt: t(40), read: true },
    { id: '1-7', chatId: '1', senderId: '2', text: 'Красиво звучит! Когда релиз?', createdAt: t(2), read: false },
  ],
  '2': [
    { id: '2-1', chatId: '2', senderId: '3', text: 'Привет, ты свободна сегодня вечером?', createdAt: t(120), read: true },
    { id: '2-2', chatId: '2', senderId: 'me', text: 'Да, а что случилось?', createdAt: t(115), read: true },
    { id: '2-3', chatId: '3', senderId: '3', text: 'Хотел встретиться, обсудить проект', createdAt: t(110), read: true },
    { id: '2-4', chatId: '2', senderId: 'me', text: 'Окей, в 7 вечера подойдёт?', createdAt: t(105), read: true },
    { id: '2-5', chatId: '2', senderId: '3', text: 'Окей, договорились 👍', createdAt: t(100), read: true },
  ],
  '3': [
    { id: '3-1', chatId: '3', senderId: '4', text: 'Всем привет! Деплой прошёл успешно 🚀', createdAt: t(180), read: true },
    { id: '3-2', chatId: '3', senderId: '5', text: 'Отлично! Наконец-то', createdAt: t(175), read: true },
    { id: '3-3', chatId: '3', senderId: 'me', text: 'Проверил — всё работает', createdAt: t(170), read: true },
    { id: '3-4', chatId: '3', senderId: '4', text: 'Теперь займёмся новым функционалом', createdAt: t(160), read: true },
    { id: '3-5', chatId: '3', senderId: '5', text: 'Какие задачи на этой неделе?', createdAt: t(150), read: true },
    { id: '3-6', chatId: '3', senderId: '4', text: 'Авторизация, чаты, уведомления', createdAt: t(140), read: true },
    { id: '3-7', chatId: '3', senderId: 'me', text: 'Беру авторизацию на себя', createdAt: t(130), read: true },
    { id: '3-8', chatId: '3', senderId: '5', text: 'Я займусь уведомлениями', createdAt: t(10), read: false },
  ],
}

interface ChatWindowProps {
  chatId: string
  chatName: string
  isOnline: boolean
  onMessageSent?: () => void
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ chatId, chatName, isOnline, onMessageSent }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userId = JSON.parse(localStorage.getItem('light-user') || '{}').id

  useEffect(() => {
    loadMessages()
    
    // Подписываемся на новые сообщения
    const socket = (window as any).socket
    if (socket) {
      const handleNewMessage = (msg: any) => {
        if (msg.chatId === chatId) {
          setMessages(prev => [...prev, {
            id: msg.id,
            chatId: msg.chatId,
            senderId: msg.senderId,
            text: msg.text,
            createdAt: new Date(msg.createdAt),
            read: msg.read
          }])
        }
      }
      
      socket.on('message:new', handleNewMessage)
      return () => {
        socket.off('message:new', handleNewMessage)
      }
    }
  }, [chatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const loadMessages = async () => {
    setLoading(true)
    try {
      const lightAPI = (window as any).lightAPI
      const token = localStorage.getItem('light-token')
      const result = await lightAPI.fetch(`http://155.212.167.68:80/api/chats/${chatId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (result.ok) {
        const msgs = JSON.parse(result.text)
        console.log('Loaded messages:', msgs.length, msgs)
        setMessages(msgs.map((m: any) => ({
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          text: m.text,
          createdAt: new Date(m.created_at * 1000),
          read: m.read === 1
        })))
      } else {
        console.error('Failed to load messages:', result.status, result.text)
      }
    } catch (err) {
      console.error('Load messages error:', err)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    
    try {
      const socket = (window as any).socket
      console.log('Sending message, socket:', !!socket, 'connected:', socket?.connected)
      
      if (socket && socket.connected) {
        socket.emit('message:send', { chatId, text })
        setInput('')
        console.log('Message sent:', { chatId, text })
        
        // Обновляем список чатов
        if (onMessageSent) {
          setTimeout(() => onMessageSent(), 500)
        }
      } else {
        console.error('Socket not connected')
        alert('Нет соединения с сервером. Перезапустите приложение.')
      }
    } catch (err) {
      console.error('Send message error:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-header-info">
          <span className="chat-header-name">{chatName}</span>
          <span className={`chat-header-status ${isOnline ? 'online' : ''}`}>
            {isOnline ? 'в сети' : 'не в сети'}
          </span>
        </div>
      </div>

      <div className="messages-list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p>Нет сообщений</p>
            <span style={{ fontSize: '13px' }}>Напишите первое сообщение</span>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOut = msg.senderId === userId
            const prevMsg = messages[i - 1]
            const showTail = !prevMsg || prevMsg.senderId !== msg.senderId
            return (
              <div key={msg.id} className={`message ${isOut ? 'out' : 'in'} ${showTail ? 'tail' : ''}`}>
                <div className="message-bubble">
                  <span className="message-text">{msg.text}</span>
                  <span className="message-meta">
                    {formatTime(msg.createdAt)}
                    {isOut && <span className="message-check">{msg.read ? '✓✓' : '✓'}</span>}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          placeholder="Написать сообщение..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="send-btn" onClick={sendMessage} disabled={!input.trim()} aria-label="Отправить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
