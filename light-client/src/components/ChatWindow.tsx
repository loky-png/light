import { useState, useRef, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import type { Message } from '../types'
import './ChatWindow.css'

interface ChatWindowProps {
  chatId: string
  chatName: string
  isOnline: boolean
  userStatus?: { status: string; lastSeen: number }
  onMessageSent?: () => void
  currentUserId: string
  token: string
  cachedMessages?: any[]
  onMessagesLoaded?: (chatId: string, messages: any[]) => void
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export default function ChatWindow({ chatId, chatName, isOnline, userStatus, onMessageSent, currentUserId, token, cachedMessages, onMessagesLoaded }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Record<string, HTMLDivElement>>({})
  const userId = currentUserId
  const toast = useToast()

  console.log('ChatWindow userId:', userId)
  
  const getStatusText = () => {
    if (!userStatus) return 'не в сети'
    
    if (userStatus.status === 'online') return 'в сети'
    if (userStatus.status === 'recently') return 'был(а) недавно'
    return 'не в сети'
  }

  useEffect(() => {
    console.log('[ChatWindow] Effect triggered for chatId:', chatId, 'cachedMessages:', cachedMessages?.length)
    
    // Проверяем есть ли кешированные сообщения
    if (cachedMessages && cachedMessages.length > 0) {
      console.log('[ChatWindow] Using cached messages:', cachedMessages.length)
      setMessages(cachedMessages)
      setLoading(false)
      
      // Прокручиваем вниз
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 0)
    } else {
      console.log('[ChatWindow] No cache, loading from server')
      // Очищаем сообщения при смене чата
      setMessages([])
      setLoading(true)
      
      loadMessages()
    }
    
    // Подписываемся на новые сообщения
    const socket = (window as any).socket
    if (!socket) return
    
    const handleNewMessage = (msg: any) => {
      console.log('[ChatWindow] New message received:', msg, 'current chatId:', chatId)
      // КРИТИЧНО: проверяем что сообщение для ЭТОГО чата
      if (msg.chatId !== chatId) {
        console.log('[ChatWindow] Message for different chat, ignoring')
        return
      }
      
      // Добавляем сообщение в список
      setMessages(prev => {
        // Проверяем что сообщение еще не добавлено (защита от дублей)
        if (prev.some(m => m.id === msg.id)) {
          console.log('[ChatWindow] Message already exists, skipping')
          return prev
        }
        console.log('[ChatWindow] Adding message to chat')
        const newMessages = [...prev, {
          id: msg.id,
          chatId: msg.chatId,
          senderId: msg.senderId,
          text: msg.text,
          createdAt: new Date(msg.createdAt),
          read: msg.read || false,
          replyTo: msg.replyTo
        }]
        
        // Обновляем кеш
        if (onMessagesLoaded) {
          onMessagesLoaded(chatId, newMessages)
        }
        
        return newMessages
      })
      
      // Автоматически помечаем как прочитанное если чат открыт
      setTimeout(() => {
        if (socket.connected) {
          socket.emit('messages:read', { chatId: msg.chatId })
        }
      }, 500)
    }
    
    const handleMessagesRead = ({ chatId: readChatId, userId: readUserId }: any) => {
      console.log('[ChatWindow] Messages read:', { readChatId, readUserId, currentChatId: chatId, currentUserId: userId })
      // КРИТИЧНО: проверяем что это для ЭТОГО чата
      if (readChatId !== chatId) {
        return
      }
      
      if (readUserId !== userId) {
        // Помечаем наши сообщения как прочитанные
        setMessages(prev => prev.map(msg => 
          msg.senderId === userId ? { ...msg, read: true } : msg
        ))
      }
    }
    
    const handleMessageDeleted = ({ messageId, forEveryone }: { messageId: string; forEveryone: boolean }) => {
      console.log('[ChatWindow] Message deleted:', { messageId, forEveryone })
      // Удаляем только если сообщение в текущем списке
      setMessages(prev => {
        const messageExists = prev.some(m => m.id === messageId)
        if (!messageExists) return prev
        
        // Добавляем класс для анимации удаления
        const messageElement = messagesRef.current[messageId]
        if (messageElement) {
          messageElement.classList.add('deleting')
          // Удаляем из списка после анимации
          setTimeout(() => {
            setMessages(p => p.filter(msg => msg.id !== messageId))
          }, 200)
          return prev
        } else {
          // Если элемента нет, удаляем сразу
          return prev.filter(msg => msg.id !== messageId)
        }
      })
    }
    
    // ВАЖНО: НЕ удаляем все обработчики, только для этого чата
    // Создаем уникальные обработчики с привязкой к chatId
    
    socket.on('message:new', handleNewMessage)
    socket.on('messages:read', handleMessagesRead)
    socket.on('message:deleted', handleMessageDeleted)
    
    console.log('[ChatWindow] Subscribed to chat:', chatId)
    
    // Помечаем сообщения как прочитанные при открытии чата
    if (socket.connected) {
      socket.emit('messages:read', { chatId })
    }
    
    return () => {
      console.log('[ChatWindow] Unsubscribing from chat:', chatId)
      // Отписываемся ТОЛЬКО от обработчиков этого чата
      socket.off('message:new', handleNewMessage)
      socket.off('messages:read', handleMessagesRead)
      socket.off('message:deleted', handleMessageDeleted)
    }
  }, [chatId, userId, cachedMessages])

  useEffect(() => {
    // Мгновенный скролл вниз без анимации
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
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
          read: m.read === 1,
          replyTo: m.reply_to ? {
            id: m.reply_to.id,
            senderId: m.reply_to.senderId,
            senderName: m.reply_to.senderName,
            text: m.reply_to.text
          } : undefined
        }))
        console.log('Mapped messages:', mapped)
        console.log('Current userId:', userId)
        setMessages(mapped)
        
        // Сохраняем в кеш
        if (onMessagesLoaded) {
          onMessagesLoaded(chatId, mapped)
        }
      } else {
        console.error('Failed to load messages:', result.status, result.text)
        toast.error('Не удалось загрузить сообщения')
      }
    } catch (err) {
      console.error('Load messages error:', err)
      toast.error('Ошибка загрузки сообщений')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    
    // Проверяем лимит символов НА КЛИЕНТЕ
    if (text.length > 1000) {
      toast.error('Сообщение слишком длинное. Максимум 1000 символов.')
      return
    }
    
    try {
      const socket = (window as any).socket
      console.log('Sending message, socket:', !!socket, 'connected:', socket?.connected)
      
      if (!socket || !socket.connected) {
        toast.error('Нет соединения с сервером. Проверьте интернет.')
        return
      }
      
      if (socket && socket.connected) {
        const messageData: any = { chatId, text }
        
        // Добавляем информацию об ответе если есть
        if (replyTo) {
          messageData.replyTo = {
            id: replyTo.id,
            senderId: replyTo.senderId,
            text: replyTo.text
          }
        }
        
        socket.emit('message:send', messageData)
        setInput('')
        setReplyTo(null)
        console.log('Message sent:', messageData)
        
        if (onMessageSent) {
          onMessageSent()
        }
      }
    } catch (err) {
      console.error('Send message error:', err)
      toast.error('Ошибка отправки сообщения')
    }
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault()
    
    // Получаем размеры окна
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    
    // Примерные размеры меню
    const menuWidth = 200
    const menuHeight = message.senderId === userId ? 200 : 150
    
    // Вычисляем позицию чтобы меню не вылезало за границы
    let x = e.clientX
    let y = e.clientY
    
    // Проверяем правую границу
    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth - 10
    }
    
    // Проверяем нижнюю границу
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight - 10
    }
    
    // Проверяем левую границу
    if (x < 10) {
      x = 10
    }
    
    // Проверяем верхнюю границу
    if (y < 10) {
      y = 10
    }
    
    setContextMenu({ messageId: message.id, x, y })
  }

  const handleReply = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId)
      if (message) {
        setReplyTo(message)
      }
      setContextMenu(null)
    }
  }

  const handleCopyMessage = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId)
      if (message) {
        navigator.clipboard.writeText(message.text)
      }
      setContextMenu(null)
    }
  }

  const handleDeleteMessage = (forEveryone: boolean) => {
    if (contextMenu) {
      const socket = (window as any).socket
      if (socket && socket.connected) {
        socket.emit('message:delete', { 
          chatId, 
          messageId: contextMenu.messageId,
          forEveryone 
        })
      }
      setContextMenu(null)
    }
  }

  const scrollToMessage = (messageId: string) => {
    const element = messagesRef.current[messageId]
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('highlight')
      setTimeout(() => element.classList.remove('highlight'), 1500)
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
            {getStatusText()}
          </span>
        </div>
      </div>

      <div className="messages-list" onClick={() => setContextMenu(null)}>
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
            const nextMsg = messages[i + 1]
            const showTail = !nextMsg || nextMsg.senderId !== msg.senderId
            const prevMsg = messages[i - 1]
            const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId
            return (
              <div 
                key={msg.id} 
                ref={el => { if (el) messagesRef.current[msg.id] = el }}
                className={`message ${isOut ? 'out' : 'in'} ${showTail ? 'tail' : ''} ${isFirstInGroup ? 'first-in-group' : ''}`}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
              >
                <div className="message-bubble">
                  {msg.replyTo && (
                    <div 
                      className="message-reply" 
                      onClick={() => scrollToMessage(msg.replyTo!.id)}
                    >
                      <div className="message-reply-line" />
                      <div className="message-reply-content">
                        <span className="message-reply-name">
                          {msg.replyTo.senderId === userId ? 'Вы' : msg.replyTo.senderName}
                        </span>
                        <span className="message-reply-text">{msg.replyTo.text}</span>
                      </div>
                    </div>
                  )}
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

      {contextMenu && (
        <div 
          className="message-context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleReply}>
            <span className="context-menu-icon">↩️</span>
            Ответить
          </button>
          <button className="context-menu-item" onClick={handleCopyMessage}>
            <span className="context-menu-icon">📋</span>
            Копировать
          </button>
          {messages.find(m => m.id === contextMenu.messageId)?.senderId === userId && (
            <>
              <div className="context-menu-divider" />
              <button className="context-menu-item delete" onClick={() => handleDeleteMessage(false)}>
                <span className="context-menu-icon">🗑️</span>
                Удалить у себя
              </button>
              <button className="context-menu-item delete" onClick={() => handleDeleteMessage(true)}>
                <span className="context-menu-icon">🗑️</span>
                Удалить у всех
              </button>
            </>
          )}
          {messages.find(m => m.id === contextMenu.messageId)?.senderId !== userId && (
            <>
              <div className="context-menu-divider" />
              <button className="context-menu-item delete" onClick={() => handleDeleteMessage(false)}>
                <span className="context-menu-icon">🗑️</span>
                Удалить сообщение
              </button>
            </>
          )}
        </div>
      )}

      <div className="chat-input-area">
        {replyTo && (
          <div className="reply-preview">
            <div className="reply-preview-line" />
            <div className="reply-preview-content">
              <span className="reply-preview-name">
                {replyTo.senderId === userId ? 'Вы' : chatName}
              </span>
              <span className="reply-preview-text">{replyTo.text}</span>
            </div>
            <button className="reply-preview-close" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <div className="chat-input-wrapper">
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
    </div>
  )
}
