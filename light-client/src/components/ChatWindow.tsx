import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { requestJson } from '../api/http'
import { getSocket } from '../api/socket'
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
  cachedMessages?: Message[]
  onMessagesLoaded?: (chatId: string, messages: Message[]) => void
  savedScrollPosition?: number
  onScrollPositionChange?: (position: number) => void
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

interface RawMessage {
  id: string
  chat_id: string
  sender_id: string
  text: string
  created_at: number
  read: number
  reply_to?: {
    id: string
    senderId: string
    senderName: string
    text: string
  } | null
}

function mapRawMessage(m: RawMessage): Message {
  return {
    id: m.id,
    chatId: m.chat_id,
    senderId: m.sender_id,
    text: m.text,
    createdAt: new Date(m.created_at * 1000),
    read: m.read === 1,
    replyTo: m.reply_to ?? undefined
  }
}

const MAX_MESSAGE_LENGTH = 1000

export default function ChatWindow({
  chatId, chatName, isOnline, userStatus, onMessageSent,
  currentUserId, token, cachedMessages, onMessagesLoaded,
  savedScrollPosition, onScrollPositionChange
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Record<string, HTMLDivElement>>({})
  const userId = currentUserId
  const toast = useToast()

  const getStatusText = () => {
    if (!userStatus) return 'не в сети'
    if (userStatus.status === 'online') return 'в сети'
    if (userStatus.status === 'recently') return 'был(а) недавно'
    return 'не в сети'
  }

  // FIX: единственная loadMessages через useCallback
  // Удалена дублирующая функция с хардкодным IP и window.lightAPI.fetch
  // FIX: единственная loadMessages через useCallback
  // Удалена дублирующая функция с хардкодным IP и window.lightAPI.fetch
  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const msgs = await requestJson<RawMessage[]>(`/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const mapped = msgs.map(mapRawMessage)
      setMessages(mapped)
      onMessagesLoaded?.(chatId, mapped)
    } catch (err) {
      console.error('Load messages error:', err)
      toast.error('Не удалось загрузить сообщения')
    } finally {
      setLoading(false)
    }
  }, [chatId, token, onMessagesLoaded, toast])

  // FIX: добавлены все реальные зависимости в deps
  useEffect(() => {
    if (cachedMessages && cachedMessages.length > 0) {
      setMessages(cachedMessages)
      setLoading(false)
    } else {
      setMessages([])
      setLoading(true)
      void loadMessages()
    }

    // FIX: используем getSocket() вместо (window as any).socket
    const socket = getSocket()
    if (!socket) return

    const handleNewMessage = (msg: {
      id: string
      chatId: string
      senderId: string
      text: string
      createdAt: number
      read: boolean
      replyTo?: Message['replyTo']
    }) => {
      if (msg.chatId !== chatId) return

      const isMyMessage = msg.senderId === userId

      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        const newMessages: Message[] = [...prev, {
          id: msg.id,
          chatId: msg.chatId,
          senderId: msg.senderId,
          text: msg.text,
          createdAt: new Date(msg.createdAt),
          read: msg.read || false,
          replyTo: msg.replyTo
        }]
        onMessagesLoaded?.(chatId, newMessages)
        
        // Автоскролл только если:
        // 1. Я сам отправил сообщение ИЛИ
        // 2. Я нахожусь внизу чата (в пределах 200px от низа)
        setTimeout(() => {
          const messagesList = messagesListRef.current
          if (!messagesList) return
          
          const isNearBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight < 200
          
          if (isMyMessage || isNearBottom) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
        }, 100)
        
        return newMessages
      })
    }

    const handleMessagesRead = ({ chatId: readChatId, userId: readUserId }: { chatId: string; userId: string }) => {
      if (readChatId !== chatId) return
      
      // readUserId - это кто прочитал сообщения
      // Если это НЕ мы, значит другой пользователь прочитал НАШИ сообщения
      if (readUserId !== userId) {
        setMessages(prev => {
          const updated = prev.map(msg =>
            msg.senderId === userId && !msg.read ? { ...msg, read: true } : msg
          )
          // Обновляем кеш
          onMessagesLoaded?.(chatId, updated)
          return updated
        })
      }
    }

    const handleMessageDeleted = ({ messageId }: { messageId: string; forEveryone: boolean }) => {
      setMessages(prev => {
        if (!prev.some(m => m.id === messageId)) return prev
        const el = messagesRef.current[messageId]
        if (el) {
          el.classList.add('deleting')
          setTimeout(() => {
            setMessages(p => p.filter(msg => msg.id !== messageId))
          }, 200)
          return prev
        }
        return prev.filter(msg => msg.id !== messageId)
      })
    }

    socket.on('message:new', handleNewMessage)
    socket.on('messages:read', handleMessagesRead)
    socket.on('message:deleted', handleMessageDeleted)

    if (socket.connected) {
      socket.emit('messages:read', { chatId })
    }

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('messages:read', handleMessagesRead)
      socket.off('message:deleted', handleMessageDeleted)
    }
  }, [chatId, userId, cachedMessages, loadMessages, onMessagesLoaded])

  // Умный скролл: восстанавливаем позицию или скроллим вниз
  const messagesListRef = useRef<HTMLDivElement>(null)
  const hasScrolledRef = useRef(false)

  // Эмитим messages:read ОДИН РАЗ при открытии чата
  useEffect(() => {
    if (loading || messages.length === 0) return
    
    const socket = getSocket()
    if (!socket || !socket.connected) return

    // Проверяем есть ли непрочитанные входящие сообщения
    const hasUnread = messages.some(m => m.senderId !== userId && !m.read)
    
    if (hasUnread) {
      socket.emit('messages:read', { chatId })
    }
  }, [chatId, loading]) // Только при смене чата и после загрузки

  // Сохраняем позицию скролла при прокрутке
  useEffect(() => {
    const messagesList = messagesListRef.current
    if (!messagesList || !onScrollPositionChange) return

    const handleScroll = () => {
      onScrollPositionChange(messagesList.scrollTop)
    }

    messagesList.addEventListener('scroll', handleScroll)
    return () => messagesList.removeEventListener('scroll', handleScroll)
  }, [onScrollPositionChange])

  useEffect(() => {
    // Сбрасываем флаг при смене чата
    hasScrolledRef.current = false
  }, [chatId])

  useEffect(() => {
    // Скроллим только если еще не скроллили и сообщения загружены
    if (!hasScrolledRef.current && !loading && messages.length > 0) {
      const messagesList = messagesListRef.current
      if (!messagesList) return

      const timer = setTimeout(() => {
        if (savedScrollPosition !== undefined && savedScrollPosition > 0) {
          // Восстанавливаем сохраненную позицию БЕЗ анимации
          messagesList.scrollTop = savedScrollPosition
        } else {
          // Первый раз открываем чат - скроллим вниз плавно
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        hasScrolledRef.current = true
      }, 50)
      
      return () => clearTimeout(timer)
    }
  }, [loading, messages.length, savedScrollPosition])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return

    if (text.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Сообщение слишком длинное. Максимум ${MAX_MESSAGE_LENGTH} символов.`)
      return
    }

    // FIX: используем getSocket() вместо (window as any).socket
    const socket = getSocket()

    // FIX: убрана дублирующая проверка (if socket && socket.connected) внутри
    if (!socket || !socket.connected) {
      toast.error('Нет соединения с сервером. Проверьте интернет.')
      return
    }

    try {
      const messageData: {
        chatId: string
        text: string
        replyTo?: { id: string; senderId: string; text: string }
      } = { chatId, text }

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
      onMessageSent?.()
    } catch (err) {
      console.error('Send message error:', err)
      toast.error('Ошибка отправки сообщения')
    }
  }

  const handleMessageContextMenu = (e: React.MouseEvent, message: Message) => {
    e.preventDefault()

    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const menuWidth = 200
    const menuHeight = message.senderId === userId ? 250 : 150

    let x = e.clientX
    let y = e.clientY

    if (x + menuWidth > windowWidth) x = x - menuWidth
    if (y + menuHeight > windowHeight) y = windowHeight - menuHeight - 10
    if (x < 10) x = 10
    if (y < 10) y = 10

    setContextMenu({ messageId: message.id, x, y })
  }

  const handleReply = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId)
      if (message) setReplyTo(message)
      setContextMenu(null)
    }
  }

  const handleCopyMessage = () => {
    if (contextMenu) {
      const message = messages.find(m => m.id === contextMenu.messageId)
      if (message) navigator.clipboard.writeText(message.text)
      setContextMenu(null)
    }
  }

  const handleDeleteMessage = (forEveryone: boolean) => {
    if (contextMenu) {
      // FIX: используем getSocket()
      const socket = getSocket()
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
      void sendMessage()
    }
  }

  const inputLength = input.length
  const isOverLimit = inputLength > MAX_MESSAGE_LENGTH

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

      <div className="messages-list" ref={messagesListRef} onClick={() => setContextMenu(null)}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Загрузка...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p>Нет сообщений</p>
            <span style={{ fontSize: '13px' }}>Напишите первое сообщение</span>
          </div>
        ) : (
          // FIX: убран console.log внутри render (вызывался при каждой перерисовке для каждого сообщения)
          messages.map((msg, i) => {
            const isOut = msg.senderId === userId
            const nextMsg = messages[i + 1]
            const showTail = !nextMsg || nextMsg.senderId !== msg.senderId
            const prevMsg = messages[i - 1]
            const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId
            return (
              <div
                key={msg.id}
                ref={el => { if (el) messagesRef.current[msg.id] = el }}
                data-message-id={msg.id}
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
                  <div className="message-content">
                    <span className="message-text">{msg.text}</span>
                    <span className="message-meta">
                      {formatTime(msg.createdAt)}
                      {isOut && (
                        <span className="message-check">
                          {msg.read ? (
                            <svg width="13" height="8" viewBox="0 0 18 12" fill="none">
                              <path d="M1 6L6 11L17 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M6 6L11 11L22 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="translate(-5, 0)"/>
                            </svg>
                          ) : (
                            <svg width="13" height="8" viewBox="0 0 14 10" fill="none">
                              <path d="M1 5L6 10L13 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {contextMenu && createPortal(
        <div
          className="message-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const msg = messages.find(m => m.id === contextMenu.messageId)
            const isOwnMessage = msg?.senderId === userId

            return (
              <>
                <button className="context-menu-item" onClick={handleReply}>
                  <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 14 4 9 9 4"/>
                    <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                  </svg>
                  Ответить
                </button>
                <button className="context-menu-item" onClick={handleCopyMessage}>
                  <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Копировать
                </button>
                {isOwnMessage && (
                  <>
                    <div className="context-menu-divider" />
                    <button className="context-menu-item delete" onClick={() => handleDeleteMessage(false)}>
                      <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                      Удалить у себя
                    </button>
                    <button className="context-menu-item delete" onClick={() => handleDeleteMessage(true)}>
                      <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                      Удалить у всех
                    </button>
                  </>
                )}
                {!isOwnMessage && (
                  <>
                    <div className="context-menu-divider" />
                    <button className="context-menu-item delete" onClick={() => handleDeleteMessage(false)}>
                      <svg className="context-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                      Удалить сообщение
                    </button>
                  </>
                )}
              </>
            )
          })()}
        </div>,
        document.body
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
            <button className="reply-preview-close" onClick={() => setReplyTo(null)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
        <div className="chat-input-wrapper">
          <input
            type="text"
            className={`chat-input${isOverLimit ? ' input-error' : ''}`}
            placeholder="Написать сообщение..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* IMPROVEMENT: счётчик символов при приближении к лимиту */}
          {inputLength > MAX_MESSAGE_LENGTH * 0.8 && (
            <span className={`char-counter${isOverLimit ? ' over-limit' : ''}`}>
              {inputLength}/{MAX_MESSAGE_LENGTH}
            </span>
          )}
          <button
            className="send-btn"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isOverLimit}
            aria-label="Отправить"
          >
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
