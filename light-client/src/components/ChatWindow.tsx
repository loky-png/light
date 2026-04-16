import { useState, useRef, useEffect } from 'react'
import type { Message } from '../types'
import './ChatWindow.css'

interface ChatWindowProps {
  chatId: string
  chatName: string
  isOnline: boolean
  onMessageSent?: () => void
  currentUserId: string
  token: string
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ chatId, chatName, isOnline, onMessageSent, currentUserId, token }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const userId = currentUserId

  console.log('ChatWindow userId:', userId)

  useEffect(() => {
    loadMessages()
    
    // Подписываемся на новые сообщения
    const socket = (window as any).socket
    if (socket) {
      const handleNewMessage = (msg: any) => {
        console.log('New message received:', msg, 'current chatId:', chatId)
        if (msg.chatId === chatId) {
          // Перезагружаем все сообщения с сервера вместо добавления локально
          loadMessages()
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
      const result = await lightAPI.fetch(`http://155.212.167.68:80/api/chats/${chatId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (result.ok) {
        const msgs = JSON.parse(result.text)
        console.log('Loaded messages from server:', msgs)
        const mapped = msgs.map((m: any) => ({
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          text: m.text,
          createdAt: new Date(m.created_at * 1000),
          read: m.read === 1
        }))
        console.log('Mapped messages:', mapped)
        console.log('Current userId:', userId)
        setMessages(mapped)
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
        
        // Сразу перезагружаем сообщения с сервера
        setTimeout(() => {
          loadMessages()
          if (onMessageSent) {
            onMessageSent()
          }
        }, 300)
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
            console.log('Message:', msg.id, 'senderId:', msg.senderId, 'userId:', userId, 'isOut:', isOut)
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
