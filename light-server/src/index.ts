import express, { Request } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import authRouter from './auth'
import db from './db'
import { JWT_SECRET, PORT } from './config'

type AuthTokenPayload = { id: string; username: string }
type PresenceStatus = 'online' | 'recently' | 'offline'
type UserStatus = { status: PresenceStatus; lastSeen: number }
type OnlineUserState = { socketIds: Set<string>; lastSeen: number }
type ChatSummary = {
  id: string
  name: string | null
  type: string
  avatar?: string | null
  last_message: string | null
  last_message_time: number | null
  unread: number
  otherUserId?: string
}
type ReplyPayload = {
  id: string
  senderId: string
  senderName?: string
  text: string
}

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

const onlineUsers = new Map<string, OnlineUserState>()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/api/auth', authRouter)

function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload
  } catch {
    return null
  }
}

function getRequestUser(req: Request): AuthTokenPayload | null {
  const token = req.headers.authorization?.split(' ')[1]
  return token ? verifyToken(token) : null
}

function getPresenceStatus(lastSeen: number, isOnline: boolean): PresenceStatus {
  if (isOnline) {
    return 'online'
  }

  if (!lastSeen) {
    return 'offline'
  }

  const elapsed = Date.now() - lastSeen
  if (elapsed < 5 * 60 * 1000) {
    return 'recently'
  }

  return 'offline'
}

function touchUserLastSeen(userId: string, timestamp = Date.now()) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(timestamp, userId)

  const existing = onlineUsers.get(userId)
  if (!existing) {
    return
  }

  existing.lastSeen = timestamp
  onlineUsers.set(userId, existing)
}

function getUserStatus(userId: string): UserStatus {
  const onlineUser = onlineUsers.get(userId)
  if (onlineUser && onlineUser.socketIds.size > 0) {
    return {
      status: 'online',
      lastSeen: onlineUser.lastSeen
    }
  }

  const userData = db.prepare('SELECT last_seen FROM users WHERE id = ?').get(userId) as { last_seen?: number } | undefined
  const lastSeen = userData?.last_seen ?? onlineUser?.lastSeen ?? 0

  return {
    status: getPresenceStatus(lastSeen, false),
    lastSeen
  }
}

function estimateBase64Bytes(value: string): number {
  const base64 = value.includes(',') ? value.split(',')[1] : value
  const normalized = base64.trim()
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding)
}

function getVisibleChats(userId: string): ChatSummary[] {
  const chats = db.prepare(`
    SELECT c.id, c.name, c.type, c.created_at,
      (
        SELECT m.text
        FROM messages m
        LEFT JOIN hidden_messages hm ON hm.message_id = m.id AND hm.user_id = ?
        WHERE m.chat_id = c.id AND hm.message_id IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT m.created_at
        FROM messages m
        LEFT JOIN hidden_messages hm ON hm.message_id = m.id AND hm.user_id = ?
        WHERE m.chat_id = c.id AND hm.message_id IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_time,
      (
        SELECT COUNT(*)
        FROM messages m
        LEFT JOIN hidden_messages hm ON hm.message_id = m.id AND hm.user_id = ?
        WHERE m.chat_id = c.id
          AND hm.message_id IS NULL
          AND m.read = 0
          AND m.sender_id != ?
      ) AS unread
    FROM chats c
    JOIN chat_members cm ON cm.chat_id = c.id
    LEFT JOIN hidden_chats hc ON hc.chat_id = c.id AND hc.user_id = ?
    WHERE cm.user_id = ? AND hc.chat_id IS NULL
    ORDER BY COALESCE(last_message_time, c.created_at) DESC, c.created_at DESC
  `).all(userId, userId, userId, userId, userId, userId) as Array<{
    id: string
    name: string | null
    type: string
    created_at: number
    last_message: string | null
    last_message_time: number | null
    unread: number
  }>

  return chats.map((chat) => {
    if (chat.type !== 'direct') {
      return chat
    }

    const otherMember = db.prepare(`
      SELECT u.id, u.avatar, u.display_name
      FROM chat_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = ? AND cm.user_id != ?
      LIMIT 1
    `).get(chat.id, userId) as { id: string; avatar: string | null; display_name: string } | undefined

    if (!otherMember) {
      return chat
    }

    return {
      ...chat,
      avatar: otherMember.avatar,
      name: otherMember.display_name || chat.name,
      otherUserId: otherMember.id
    }
  })
}

function getChatForUser(chatId: string, userId: string): ChatSummary | undefined {
  return getVisibleChats(userId).find((chat) => chat.id === chatId)
}

function getChatParticipantIds(chatId: string): string[] {
  const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId) as Array<{ user_id: string }>
  return members.map((member) => member.user_id)
}

function unhideChatForUsers(chatId: string, userIds: string[]) {
  if (userIds.length === 0) {
    return
  }

  const placeholders = userIds.map(() => '?').join(', ')
  db.prepare(`DELETE FROM hidden_chats WHERE chat_id = ? AND user_id IN (${placeholders})`).run(chatId, ...userIds)
}

function emitToUser(userId: string, event: string, payload: unknown) {
  const userState = onlineUsers.get(userId)
  if (!userState) {
    return
  }

  for (const socketId of userState.socketIds) {
    const socket = io.sockets.sockets.get(socketId)
    socket?.emit(event, payload)
  }
}

function joinUserSocketsToChat(chatId: string, userId: string) {
  const userState = onlineUsers.get(userId)
  if (!userState) {
    return
  }

  for (const socketId of userState.socketIds) {
    const socket = io.sockets.sockets.get(socketId)
    socket?.join(chatId)
  }
}

function cleanupOldMessages() {
  try {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)
    const oldMessages = db.prepare('SELECT id FROM messages WHERE created_at < ?').all(sevenDaysAgo) as Array<{ id: string }>

    if (oldMessages.length === 0) {
      return
    }

    const cleanup = db.transaction(() => {
      const batchSize = 500

      for (let i = 0; i < oldMessages.length; i += batchSize) {
        const batch = oldMessages.slice(i, i + batchSize)
        const placeholders = batch.map(() => '?').join(', ')
        db.prepare(`DELETE FROM hidden_messages WHERE message_id IN (${placeholders})`).run(...batch.map((message) => message.id))
      }

      return db.prepare('DELETE FROM messages WHERE created_at < ?').run(sevenDaysAgo).changes
    })

    const deletedCount = cleanup()
    console.log(`Deleted ${deletedCount} messages older than 7 days`)
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

setInterval(cleanupOldMessages, 24 * 60 * 60 * 1000)
cleanupOldMessages()

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() })
})

app.get('/api/auth/validate', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const dbUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(user.id) as
    | { id: string; username: string; display_name: string; avatar: string | null }
    | undefined

  if (!dbUser) {
    return res.status(401).json({ error: 'User not found' })
  }

  touchUserLastSeen(dbUser.id)

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

app.put('/api/profile', (req, res) => {
  try {
    const user = getRequestUser(req)
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const currentUser = db.prepare('SELECT username FROM users WHERE id = ?').get(user.id) as { username: string } | undefined
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const displayName = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : ''
    const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : ''
    const avatar = typeof req.body.avatar === 'string' && req.body.avatar ? req.body.avatar : null

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' })
    }
    if (displayName.length > 100) {
      return res.status(400).json({ error: 'Display name too long' })
    }
    if (!username || username.length < 4) {
      return res.status(400).json({ error: 'Username must be at least 4 characters' })
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers and underscore' })
    }
    if (avatar && !avatar.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Avatar must be an image data URL' })
    }
    if (avatar && estimateBase64Bytes(avatar) > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Avatar too large (max 5MB)' })
    }

    if (username !== currentUser.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id)
      if (existing) {
        return res.status(409).json({ error: 'Username already taken' })
      }
    }

    db.prepare('UPDATE users SET display_name = ?, username = ?, avatar = ?, last_seen = ? WHERE id = ?')
      .run(displayName, username, avatar, Date.now(), user.id)

    const updatedUser = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE id = ?').get(user.id) as
      | { id: string; username: string; display_name: string; avatar: string | null }
      | undefined

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.display_name,
        avatar: updatedUser.avatar
      }
    })
  } catch (error: any) {
    console.error('Profile update error:', error)
    return res.status(500).json({ error: error.message })
  }
})

app.get('/api/users/search', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (query.length < 2) {
    return res.json([])
  }
  if (query.length > 50) {
    return res.status(400).json({ error: 'Query too long' })
  }

  const likeQuery = `%${query}%`
  const users = db.prepare(`
    SELECT id, username, display_name, avatar
    FROM users
    WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
    ORDER BY CASE WHEN username LIKE ? THEN 0 ELSE 1 END, display_name ASC
    LIMIT 20
  `).all(user.id, likeQuery, likeQuery, likeQuery) as Array<{
    id: string
    username: string
    display_name: string
    avatar: string | null
  }>

  return res.json(users)
})

app.delete('/api/chats/:chatId', (req, res) => {
  try {
    const user = getRequestUser(req)
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { chatId } = req.params
    const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
    if (!member) {
      return res.status(403).json({ error: 'Not a member' })
    }

    db.prepare('INSERT OR REPLACE INTO hidden_chats (chat_id, user_id, hidden_at) VALUES (?, ?, ?)')
      .run(chatId, user.id, Math.floor(Date.now() / 1000))

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Delete chat error:', error)
    return res.status(500).json({ error: error.message })
  }
})

app.post('/api/chats/direct', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const targetUserId = typeof req.body.userId === 'string' ? req.body.userId : ''
  if (!targetUserId) {
    return res.status(400).json({ error: 'userId required' })
  }
  if (targetUserId === user.id) {
    return res.status(400).json({ error: 'Cannot create chat with yourself' })
  }

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId) as { id: string } | undefined
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' })
  }

  const result = db.transaction(() => {
    const existingChat = db.prepare(`
      SELECT c.id
      FROM chats c
      WHERE c.type = 'direct'
        AND EXISTS (
          SELECT 1
          FROM chat_members cm1
          WHERE cm1.chat_id = c.id AND cm1.user_id = ?
        )
        AND EXISTS (
          SELECT 1
          FROM chat_members cm2
          WHERE cm2.chat_id = c.id AND cm2.user_id = ?
        )
        AND (
          SELECT COUNT(*)
          FROM chat_members cm
          WHERE cm.chat_id = c.id
        ) = 2
      LIMIT 1
    `).get(user.id, targetUserId) as { id: string } | undefined

    if (existingChat) {
      db.prepare('DELETE FROM hidden_chats WHERE chat_id = ? AND user_id = ?').run(existingChat.id, user.id)
      return { chatId: existingChat.id, created: false }
    }

    const chatId = randomUUID()
    db.prepare('INSERT INTO chats (id, type, name) VALUES (?, ?, ?)').run(chatId, 'direct', null)
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?), (?, ?)').run(chatId, user.id, chatId, targetUserId)

    return { chatId, created: true }
  })()

  const chatForRequester = getChatForUser(result.chatId, user.id)
  if (!chatForRequester) {
    return res.status(500).json({ error: 'Failed to load chat' })
  }

  joinUserSocketsToChat(result.chatId, user.id)

  if (result.created) {
    joinUserSocketsToChat(result.chatId, targetUserId)
    emitToUser(user.id, 'chat:created', chatForRequester)

    const chatForTarget = getChatForUser(result.chatId, targetUserId)
    if (chatForTarget) {
      emitToUser(targetUserId, 'chat:created', chatForTarget)
    }
  }

  return res.json({ chat: chatForRequester })
})

app.get('/api/users/online', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const statuses: Record<string, UserStatus> = {}
  for (const [userId] of onlineUsers) {
    statuses[userId] = getUserStatus(userId)
  }

  return res.json(statuses)
})

app.get('/api/sync', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const chats = getVisibleChats(user.id)
  const userStatuses: Record<string, UserStatus> = {}

  for (const chat of chats) {
    if (chat.otherUserId && !userStatuses[chat.otherUserId]) {
      userStatuses[chat.otherUserId] = getUserStatus(chat.otherUserId)
    }
  }

  return res.json({
    chats,
    userStatuses,
    timestamp: Date.now()
  })
})

app.get('/api/chats', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return res.json(getVisibleChats(user.id))
})

app.get('/api/chats/:chatId/messages', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { chatId } = req.params
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
  if (!member) {
    return res.status(403).json({ error: 'Not a member' })
  }

  const messages = db.prepare(`
    SELECT recent.id, recent.chat_id, recent.sender_id, recent.text, recent.created_at, recent.read, recent.reply_to, u.username, u.display_name
    FROM (
      SELECT m.id, m.chat_id, m.sender_id, m.text, m.created_at, m.read, m.reply_to
      FROM messages m
      LEFT JOIN hidden_messages hm ON hm.message_id = m.id AND hm.user_id = ?
      WHERE m.chat_id = ? AND hm.message_id IS NULL
      ORDER BY m.created_at DESC
      LIMIT 100
    ) recent
    JOIN users u ON u.id = recent.sender_id
    ORDER BY recent.created_at ASC
  `).all(user.id, chatId) as Array<{
    id: string
    chat_id: string
    sender_id: string
    text: string
    created_at: number
    read: number
    reply_to: string | null
    username: string
    display_name: string
  }>

  const messagesWithReply = messages.map((message) => {
    if (!message.reply_to) {
      return message
    }

    try {
      const replyData = JSON.parse(message.reply_to) as ReplyPayload
      const replySender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(replyData.senderId) as
        | { display_name: string }
        | undefined

      return {
        ...message,
        reply_to: {
          ...replyData,
          senderName: replySender?.display_name || 'Unknown'
        }
      }
    } catch {
      return {
        ...message,
        reply_to: null
      }
    }
  })

  return res.json(messagesWithReply)
})

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  const user = typeof token === 'string' ? verifyToken(token) : null

  if (!user) {
    return next(new Error('Unauthorized'))
  }

  socket.data.user = user
  next()
})

io.on('connection', (socket) => {
  const user = socket.data.user as AuthTokenPayload
  const now = Date.now()
  const state = onlineUsers.get(user.id) ?? { socketIds: new Set<string>(), lastSeen: now }

  state.socketIds.add(socket.id)
  state.lastSeen = now
  onlineUsers.set(user.id, state)
  touchUserLastSeen(user.id, now)

  io.emit('user:online', { userId: user.id, lastSeen: now })

  const chats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(user.id) as Array<{ chat_id: string }>
  chats.forEach((chat) => socket.join(chat.chat_id))

  socket.on('ping', (timestamp: number) => {
    const pingTime = Date.now()
    touchUserLastSeen(user.id, pingTime)
    socket.emit('pong', timestamp)
  })

  socket.on('messages:read', ({ chatId }: { chatId: string }) => {
    const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
    if (!member) {
      return
    }

    const result = db.prepare(`
      UPDATE messages
      SET read = 1
      WHERE chat_id = ? AND sender_id != ? AND read = 0
    `).run(chatId, user.id)

    console.log(`[messages:read] User ${user.id} read ${result.changes} messages in chat ${chatId}`)

    io.to(chatId).emit('messages:read', { chatId, userId: user.id })
  })

  socket.on('message:send', ({ chatId, text, replyTo }: { chatId: string; text: string; replyTo?: ReplyPayload }) => {
    try {
      const normalizedText = typeof text === 'string' ? text.trim() : ''
      if (!normalizedText) {
        return
      }
      if (normalizedText.length > 1000) {
        socket.emit('error', { message: 'Message too long' })
        return
      }

      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
      if (!member) {
        socket.emit('error', { message: 'Not a member of this chat' })
        return
      }

      let replyPayload: ReplyPayload | null = null
      if (replyTo?.id) {
        const replyMessage = db.prepare(`
          SELECT id, sender_id, text
          FROM messages
          WHERE id = ? AND chat_id = ?
          LIMIT 1
        `).get(replyTo.id, chatId) as { id: string; sender_id: string; text: string } | undefined

        if (!replyMessage) {
          socket.emit('error', { message: 'Reply message not found' })
          return
        }

        replyPayload = {
          id: replyMessage.id,
          senderId: replyMessage.sender_id,
          text: replyMessage.text
        }
      }

      const messageId = randomUUID()
      const createdAt = Math.floor(Date.now() / 1000)

      db.prepare('INSERT INTO messages (id, chat_id, sender_id, text, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)')
        .run(messageId, chatId, user.id, normalizedText, createdAt, replyPayload ? JSON.stringify(replyPayload) : null)

      const participantIds = getChatParticipantIds(chatId)
      unhideChatForUsers(chatId, participantIds)

      const message: {
        id: string
        chatId: string
        text: string
        senderId: string
        username: string
        createdAt: number
        read: boolean
        replyTo?: ReplyPayload
      } = {
        id: messageId,
        chatId,
        text: normalizedText,
        senderId: user.id,
        username: user.username,
        createdAt: createdAt * 1000,
        read: false
      }

      if (replyPayload) {
        const replySender = db.prepare('SELECT display_name FROM users WHERE id = ?').get(replyPayload.senderId) as
          | { display_name: string }
          | undefined

        message.replyTo = {
          ...replyPayload,
          senderName: replySender?.display_name || 'Unknown'
        }
      }

      io.to(chatId).emit('message:new', message)
    } catch (error) {
      console.error('Message send error:', error)
      socket.emit('error', { message: 'Failed to send message' })
    }
  })

  socket.on('message:delete', ({ chatId, messageId, forEveryone }: { chatId: string; messageId: string; forEveryone: boolean }) => {
    try {
      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, user.id)
      if (!member) {
        socket.emit('error', { message: 'Not a member of this chat' })
        return
      }

      const message = db.prepare('SELECT * FROM messages WHERE id = ? AND chat_id = ?').get(messageId, chatId) as
        | { sender_id: string }
        | undefined
      if (!message) {
        socket.emit('error', { message: 'Message not found' })
        return
      }

      if (forEveryone) {
        if (message.sender_id !== user.id) {
          socket.emit('error', { message: 'You can only delete your own messages for everyone' })
          return
        }

        db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)
        db.prepare('DELETE FROM hidden_messages WHERE message_id = ?').run(messageId)
        io.to(chatId).emit('message:deleted', { messageId, forEveryone: true })
        return
      }

      db.prepare('INSERT OR IGNORE INTO hidden_messages (message_id, user_id) VALUES (?, ?)').run(messageId, user.id)
      socket.emit('message:deleted', { messageId, forEveryone: false })
    } catch (error) {
      console.error('Message delete error:', error)
      socket.emit('error', { message: 'Failed to delete message' })
    }
  })

  socket.on('disconnect', () => {
    const disconnectTime = Date.now()
    const currentState = onlineUsers.get(user.id)

    if (!currentState) {
      return
    }

    currentState.socketIds.delete(socket.id)
    currentState.lastSeen = disconnectTime
    onlineUsers.set(user.id, currentState)
    touchUserLastSeen(user.id, disconnectTime)

    if (currentState.socketIds.size > 0) {
      return
    }

    io.emit('user:offline', { userId: user.id, lastSeen: disconnectTime })

    setTimeout(() => {
      const latestState = onlineUsers.get(user.id)
      if (!latestState) {
        return
      }

      if (latestState.socketIds.size === 0 && latestState.lastSeen === disconnectTime) {
        onlineUsers.delete(user.id)
      }
    }, 5 * 60 * 1000)
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Light server running on 0.0.0.0:${PORT}`)
})
