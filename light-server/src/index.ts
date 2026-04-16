import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import authRouter from './auth'
import db from './db'

const app = express()
const httpServer = createServer(app)
const JWT_SECRET = process.env.JWT_SECRET || 'light-secret-change-in-prod'
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' })) // Увеличиваем лимит для base64 изображений
app.use('/api/auth', authRouter)

// Middleware для проверки токена
function verifyToken(token: string): { id: string; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string }
  } catch {
    return null
  }
}

// REST: валидация токена и получение данных пользователя
app.get('/api/auth/validate', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Invalid token' })
  
  // Проверяем что пользователь существует в БД и возвращаем его данные
  const dbUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(user.id) as any
  if (!dbUser) return res.status(401).json({ error: 'User not found' })
  
  return res.json({ 
    valid: true,
    user: {
      id: dbUser.id,
      username: dbUser.username,
      displayName: dbUser.display_name,
      avatar: dbUser.avatar
    }
  })
})

// REST: обновить профиль пользователя
app.put('/api/profile', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    const user = token ? verifyToken(token) : null
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { displayName, username, avatar } = req.body

    // Валидация displayName
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'Display name is required' })
    }
    
    if (displayName.trim().length > 100) {
      return res.status(400).json({ error: 'Display name too long' })
    }

    // Валидация username
    if (username && username.length < 4) {
      return res.status(400).json({ error: 'Username must be at least 4 characters' })
    }
    
    if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers and underscore' })
    }

    // Валидация аватара (проверяем размер base64)
    if (avatar && avatar.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Avatar too large (max 5MB)' })
    }

    // Проверка username на уникальность (если меняется)
    if (username && username !== user.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id)
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' })
      }
    }

    // Обновляем профиль
    db.prepare('UPDATE users SET display_name = ?, username = ?, avatar = ? WHERE id = ?')
      .run(displayName.trim(), username || user.username, avatar || null, user.id)

    const updatedUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(user.id) as any

    return res.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.display_name,
        avatar: updatedUser.avatar
      }
    })
  } catch (err: any) {
    console.error('Profile update error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// REST: поиск пользователей
app.get('/api/users/search', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const query = req.query.q as string
  if (!query || query.length < 2) {
    return res.json([])
  }

  const users = db.prepare(`
    SELECT id, username, display_name, avatar
    FROM users
    WHERE username LIKE ? AND id != ?
    LIMIT 20
  `).all(`%${query}%`, user.id)

  return res.json(users)
})

// REST: удалить чат
app.delete('/api/chats/:chatId', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    const user = token ? verifyToken(token) : null
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { chatId } = req.params

    // Проверяем что пользователь является участником чата
    const member = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
    if (!member) return res.status(403).json({ error: 'Not a member' })

    // Получаем все ID сообщений чата для удаления
    const messageIds = db.prepare('SELECT id FROM messages WHERE chat_id = ?').all(chatId) as { id: string }[]
    
    // Удаляем только сообщения и связи, но НЕ сам чат
    // Это позволит переиспользовать чат при повторном обращении
    db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId)
    
    // Удаляем скрытые сообщения
    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM hidden_messages WHERE message_id IN (${placeholders})`).run(...messageIds.map(m => m.id))
    }
    
    // Удаляем чат из списка только для текущего пользователя
    // Для этого удаляем его членство
    db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(chatId, user.id)
    
    // Если больше нет участников, удаляем сам чат
    const remainingMembers = db.prepare('SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ?').get(chatId) as { count: number }
    if (remainingMembers.count === 0) {
      db.prepare('DELETE FROM chats WHERE id = ?').run(chatId)
    }

    return res.json({ success: true })
  } catch (err: any) {
    console.error('Delete chat error:', err)
    return res.status(500).json({ error: err.message })
  }
})

// REST: создать или получить direct чат
app.post('/api/chats/direct', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId required' })
  
  console.log('Creating chat:', { currentUserId: user.id, targetUserId: userId })
  
  // Запрещаем создание чата с самим собой
  if (userId === user.id) {
    console.error('Attempt to create self-chat:', user.id)
    return res.status(400).json({ error: 'Cannot create chat with yourself' })
  }

  // Проверяем что целевой пользователь существует
  const targetUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(userId) as any
  if (!targetUser) {
    console.error('Target user not found:', userId)
    return res.status(404).json({ error: 'User not found' })
  }

  // Проверяем существует ли уже чат между ЭТИМИ ДВУМЯ пользователями
  const existingChat = db.prepare(`
    SELECT c.id, c.name, c.type
    FROM chats c
    WHERE c.type = 'direct'
    AND EXISTS (
      SELECT 1 FROM chat_members cm1 
      WHERE cm1.chat_id = c.id AND cm1.user_id = ?
    )
    AND EXISTS (
      SELECT 1 FROM chat_members cm2 
      WHERE cm2.chat_id = c.id AND cm2.user_id = ?
    )
    AND (
      SELECT COUNT(*) FROM chat_members cm 
      WHERE cm.chat_id = c.id
    ) = 2
    LIMIT 1
  `).get(user.id, userId) as any

  if (existingChat) {
    console.log('Chat already exists between users:', existingChat.id)
    
    // Возвращаем существующий чат с полными данными
    return res.json({ 
      chat: {
        id: existingChat.id,
        type: existingChat.type,
        name: targetUser.display_name,
        avatar: targetUser.avatar,
        last_message: null,
        last_message_time: null,
        unread: 0,
        otherUserId: userId
      }
    })
  }

  // Создаем новый чат
  const chatId = randomUUID()
  
  db.prepare('INSERT INTO chats (id, type, name) VALUES (?, ?, ?)').run(chatId, 'direct', targetUser.display_name)
  db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?), (?, ?)').run(chatId, user.id, chatId, userId)

  console.log('Chat created:', chatId)
  
  const newChat = { 
    id: chatId, 
    type: 'direct', 
    name: targetUser.display_name,
    avatar: targetUser.avatar,
    last_message: null,
    last_message_time: null,
    unread: 0,
    otherUserId: userId
  }
  
  // Уведомляем ОБОИХ пользователей о новом чате через socket
  const currentUserSocket = onlineUsers.get(user.id)
  const targetUserSocket = onlineUsers.get(userId)
  
  if (currentUserSocket) {
    const socket = io.sockets.sockets.get(currentUserSocket.socketId)
    if (socket) {
      socket.join(chatId)
      socket.emit('chat:created', newChat)
    }
  }
  
  if (targetUserSocket) {
    const socket = io.sockets.sockets.get(targetUserSocket.socketId)
    if (socket) {
      socket.join(chatId)
      // Для второго пользователя имя чата - это имя создателя
      const creator = db.prepare('SELECT display_name, avatar FROM users WHERE id = ?').get(user.id) as any
      socket.emit('chat:created', {
        ...newChat,
        name: creator.display_name,
        avatar: creator.avatar,
        otherUserId: user.id
      })
    }
  }
  
  return res.json({ chat: newChat })
})

// REST: получить онлайн пользователей с lastSeen
app.get('/api/users/online', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const now = Date.now()
  const usersStatus: Record<string, { status: string; lastSeen: number }> = {}
  
  onlineUsers.forEach((userData, userId) => {
    const timeSinceLastSeen = now - userData.lastSeen
    let status = 'offline'
    
    if (timeSinceLastSeen < 10000) {
      // Активен в последние 10 секунд
      status = 'online'
    } else if (timeSinceLastSeen < 300000) {
      // Был активен в последние 5 минут
      status = 'recently'
    }
    
    usersStatus[userId] = {
      status,
      lastSeen: userData.lastSeen
    }
  })
  
  return res.json(usersStatus)
})

// REST: получить список чатов пользователя
app.get('/api/chats', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  // Получаем чаты с информацией о собеседнике для direct чатов
  const chats = db.prepare(`
    SELECT c.id, c.name, c.type,
      (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND read = 0 AND sender_id != ?) as unread
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.user_id = ?
    ORDER BY last_message_time DESC
  `).all(user.id, user.id) as any[]

  // Для direct чатов добавляем аватар собеседника
  const enrichedChats = chats.map(chat => {
    if (chat.type === 'direct') {
      // Находим собеседника
      const otherMember = db.prepare(`
        SELECT u.id, u.avatar, u.display_name
        FROM chat_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.chat_id = ? AND cm.user_id != ?
        LIMIT 1
      `).get(chat.id, user.id) as any
      
      if (otherMember) {
        return {
          ...chat,
          avatar: otherMember.avatar,
          name: otherMember.display_name || chat.name,
          otherUserId: otherMember.id
        }
      }
    }
    return chat
  })

  return res.json(enrichedChats)
})

// REST: получить сообщения чата
app.get('/api/chats/:chatId/messages', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { chatId } = req.params
  
  // Проверяем что пользователь является участником чата
  const member = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
  if (!member) {
    console.error('User not a member of chat:', user.id, chatId)
    return res.status(403).json({ error: 'Not a member' })
  }

  // Получаем сообщения, исключая скрытые для текущего пользователя
  const messages = db.prepare(`
    SELECT m.id, m.chat_id, m.sender_id, m.text, m.created_at, m.read, m.reply_to, u.username, u.display_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN hidden_messages hm ON hm.message_id = m.id AND hm.user_id = ?
    WHERE m.chat_id = ? AND hm.message_id IS NULL
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(user.id, chatId) as any[]

  // Парсим reply_to из JSON
  const messagesWithReply = messages.map(msg => {
    if (msg.reply_to) {
      try {
        const replyData = JSON.parse(msg.reply_to)
        const replyToSender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(replyData.senderId) as any
        return {
          ...msg,
          reply_to: {
            ...replyData,
            senderName: replyToSender?.display_name || 'Unknown'
          }
        }
      } catch (e) {
        return msg
      }
    }
    return msg
  })

  console.log(`Loaded ${messagesWithReply.length} messages for chat ${chatId}, user ${user.id}`)
  if (messagesWithReply.length > 0) {
    console.log('Sample message:', JSON.stringify(messagesWithReply[0]))
  }
  return res.json(messagesWithReply)
})

// Socket.IO
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// Онлайн пользователи: userId -> { socketId, lastSeen }
const onlineUsers = new Map<string, { socketId: string; lastSeen: number }>()

// Функция для удаления старых сообщений (старше 7 дней)
function cleanupOldMessages() {
  try {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)
    
    // Получаем ID старых сообщений
    const oldMessages = db.prepare('SELECT id FROM messages WHERE created_at < ?').all(sevenDaysAgo) as { id: string }[]
    
    if (oldMessages.length > 0) {
      // Удаляем скрытые сообщения
      const placeholders = oldMessages.map(() => '?').join(',')
      db.prepare(`DELETE FROM hidden_messages WHERE message_id IN (${placeholders})`).run(...oldMessages.map(m => m.id))
      
      // Удаляем сами сообщения
      const result = db.prepare('DELETE FROM messages WHERE created_at < ?').run(sevenDaysAgo)
      console.log(`Deleted ${result.changes} messages older than 7 days`)
    }
  } catch (err) {
    console.error('Cleanup error:', err)
  }
}

// Запускаем очистку каждые 24 часа
setInterval(cleanupOldMessages, 24 * 60 * 60 * 1000)
// Запускаем очистку при старте сервера
cleanupOldMessages()

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  const user = verifyToken(token)
  if (!user) return next(new Error('Unauthorized'))
  socket.data.user = user
  next()
})

io.on('connection', (socket) => {
  const user = socket.data.user
  const now = Date.now()
  onlineUsers.set(user.id, { socketId: socket.id, lastSeen: now })
  io.emit('user:online', { userId: user.id, lastSeen: now })
  console.log('User connected:', user.username, socket.id)

  // Присоединяемся ко всем чатам пользователя
  const chats = db.prepare(`
    SELECT chat_id FROM chat_members WHERE user_id = ?
  `).all(user.id) as { chat_id: string }[]
  chats.forEach(c => socket.join(c.chat_id))

  // Пинг-понг для проверки соединения и обновления lastSeen
  socket.on('ping', (timestamp: number) => {
    const now = Date.now()
    const userData = onlineUsers.get(user.id)
    if (userData) {
      userData.lastSeen = now
      onlineUsers.set(user.id, userData)
    }
    socket.emit('pong', timestamp)
  })

  // Пометить сообщения как прочитанные
  socket.on('messages:read', ({ chatId }: { chatId: string }) => {
    // Помечаем все сообщения в чате как прочитанные для текущего пользователя
    db.prepare(`
      UPDATE messages 
      SET read = 1 
      WHERE chat_id = ? AND sender_id != ? AND read = 0
    `).run(chatId, user.id)
    
    console.log('Messages marked as read:', { chatId, userId: user.id })
    
    // Уведомляем отправителей что сообщения прочитаны
    io.to(chatId).emit('messages:read', { chatId, userId: user.id })
  })

  // Отправка сообщения
  socket.on('message:send', ({ chatId, text, replyTo }: { chatId: string; text: string; replyTo?: any }) => {
    try {
      if (!text?.trim()) return
      
      // Проверяем лимит символов
      if (text.trim().length > 1000) {
        console.error('Message too long:', text.length)
        socket.emit('error', { message: 'Message too long' })
        return
      }
      
      // Проверяем что пользователь является участником чата
      const member = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
      if (!member) {
        console.error('User not a member of chat:', user.id, chatId)
        socket.emit('error', { message: 'Not a member of this chat' })
        return
      }
      
      const id = randomUUID()
      const now = Math.floor(Date.now() / 1000)
      
      // Сохраняем информацию об ответе если есть
      const replyToData = replyTo ? JSON.stringify(replyTo) : null
      
      console.log('Saving message:', { id, chatId, senderId: user.id, text: text.trim(), replyTo: replyToData })
      db.prepare('INSERT INTO messages (id, chat_id, sender_id, text, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, chatId, user.id, text.trim(), now, replyToData)

      // Получаем имя отправителя для ответа
      const sender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(user.id) as any
      
      const msg: any = {
        id, 
        chatId, 
        text: text.trim(),
        senderId: user.id,
        username: user.username,
        createdAt: now * 1000,
        read: false,
      }
      
      // Добавляем информацию об ответе с именем отправителя
      if (replyTo) {
        const replyToSender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(replyTo.senderId) as any
        msg.replyTo = {
          ...replyTo,
          senderName: replyToSender?.display_name || 'Unknown'
        }
      }
      
      console.log('Broadcasting message:', msg)
      io.to(chatId).emit('message:new', msg)
    } catch (err) {
      console.error('Message send error:', err)
      socket.emit('error', { message: 'Failed to send message' })
    }
  })

  // Удаление сообщения
  socket.on('message:delete', ({ chatId, messageId, forEveryone }: { chatId: string; messageId: string; forEveryone: boolean }) => {
    try {
      // Проверяем что пользователь является участником чата
      const member = db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
      if (!member) {
        console.error('User not a member of chat:', user.id, chatId)
        socket.emit('error', { message: 'Not a member of this chat' })
        return
      }
      
      // Проверяем что сообщение существует
      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any
      if (!message) {
        console.error('Message not found:', messageId)
        socket.emit('error', { message: 'Message not found' })
        return
      }
      
      if (forEveryone) {
        // Удалить у всех может только отправитель
        if (message.sender_id !== user.id) {
          console.error('User cannot delete message for everyone:', messageId, user.id)
          socket.emit('error', { message: 'You can only delete your own messages for everyone' })
          return
        }
        
        // Удаляем сообщение полностью из базы данных для всех
        db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)
        db.prepare('DELETE FROM hidden_messages WHERE message_id = ?').run(messageId)
        console.log('Message deleted for everyone:', messageId)
        
        // Уведомляем всех участников чата
        io.to(chatId).emit('message:deleted', { messageId, forEveryone: true })
      } else {
        // Скрываем сообщение только для текущего пользователя (работает для любых сообщений)
        db.prepare('INSERT OR IGNORE INTO hidden_messages (message_id, user_id) VALUES (?, ?)').run(messageId, user.id)
        console.log('Message hidden for user:', messageId, user.id)
        
        // Уведомляем только текущего пользователя
        socket.emit('message:deleted', { messageId, forEveryone: false })
      }
    } catch (err) {
      console.error('Message delete error:', err)
      socket.emit('error', { message: 'Failed to delete message' })
    }
  })

  socket.on('disconnect', () => {
    const now = Date.now()
    const userData = onlineUsers.get(user.id)
    if (userData) {
      userData.lastSeen = now
      onlineUsers.set(user.id, userData)
    }
    io.emit('user:offline', { userId: user.id, lastSeen: now })
    console.log('User disconnected:', user.username)
  })
})

httpServer.listen(PORT as number, '0.0.0.0', () => {
  console.log(`Light server running on 0.0.0.0:${PORT}`)
})
