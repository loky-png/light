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

// REST: обновить профиль пользователя
app.put('/api/profile', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { displayName, username, avatar } = req.body

  // Проверка username на уникальность (если меняется)
  if (username && username !== user.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id)
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' })
    }
  }

  // Обновляем профиль
  db.prepare('UPDATE users SET display_name = ?, username = ?, avatar = ? WHERE id = ?')
    .run(displayName || user.username, username || user.username, avatar || null, user.id)

  const updatedUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(user.id) as any

  return res.json({
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.display_name,
      avatar: updatedUser.avatar
    }
  })
})

// Middleware для проверки токена
function verifyToken(token: string): { id: string; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string }
  } catch {
    return null
  }
}

// REST: получить список чатов пользователя
app.get('/api/chats', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const chats = db.prepare(`
    SELECT c.id, c.name, c.type,
      (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE chat_id = c.id AND read = 0 AND sender_id != ?) as unread
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    WHERE cm.user_id = ?
    ORDER BY last_message_time DESC
  `).all(user.id, user.id)

  return res.json(chats)
})

// REST: получить сообщения чата
app.get('/api/chats/:chatId/messages', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  const user = token ? verifyToken(token) : null
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `).all(req.params.chatId)

  return res.json(messages)
})

// Socket.IO
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

// Онлайн пользователи: userId -> socketId
const onlineUsers = new Map<string, string>()

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  const user = verifyToken(token)
  if (!user) return next(new Error('Unauthorized'))
  socket.data.user = user
  next()
})

io.on('connection', (socket) => {
  const user = socket.data.user
  onlineUsers.set(user.id, socket.id)
  io.emit('user:online', { userId: user.id })

  // Присоединяемся ко всем чатам пользователя
  const chats = db.prepare(`
    SELECT chat_id FROM chat_members WHERE user_id = ?
  `).all(user.id) as { chat_id: string }[]
  chats.forEach(c => socket.join(c.chat_id))

  // Отправка сообщения
  socket.on('message:send', ({ chatId, text }: { chatId: string; text: string }) => {
    if (!text?.trim()) return
    const id = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    db.prepare('INSERT INTO messages (id, chat_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, chatId, user.id, text.trim(), now)

    const msg = {
      id, chatId, text: text.trim(),
      senderId: user.id,
      username: user.username,
      createdAt: now * 1000,
      read: false,
    }
    io.to(chatId).emit('message:new', msg)
  })

  socket.on('disconnect', () => {
    onlineUsers.delete(user.id)
    io.emit('user:offline', { userId: user.id })
  })
})

httpServer.listen(PORT as number, '0.0.0.0', () => {
  console.log(`Light server running on 0.0.0.0:${PORT}`)
})
