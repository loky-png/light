import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import db from './db'
import { JWT_SECRET } from './config'

const router = Router()

// IMPROVEMENT: простой rate limiter для защиты от брутфорса
// Хранит количество попыток по IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_ATTEMPTS = 10
const LOCKOUT_MS = 15 * 60 * 1000 // 15 минут

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOCKOUT_MS })
    return true
  }

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return false
  }

  entry.count++
  return true
}

function resetRateLimit(ip: string) {
  loginAttempts.delete(ip)
}

// Очищаем устаревшие записи каждые 30 минут
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip)
  }
}, 30 * 60 * 1000)

function normalizeUsername(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLowerCase() : ''
}

function normalizeDisplayName(displayName: unknown): string {
  return typeof displayName === 'string' ? displayName.trim() : ''
}

// Типизация строки пользователя из БД
interface DbUser {
  id: string
  username: string
  display_name: string
  password_hash: string
  avatar: string | null
  last_seen: number
}

router.post('/register', async (req: Request, res: Response) => {
  const username = normalizeUsername(req.body.username)
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  const displayName = normalizeDisplayName(req.body.displayName)

  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }
  if (username.length < 4) {
    return res.status(400).json({ error: 'Юзернейм минимум 4 символа' })
  }
  if (username.length > 32) {
    return res.status(400).json({ error: 'Юзернейм максимум 32 символа' })
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Юзернейм только латинские буквы, цифры и _' })
  }
  if (displayName.length > 100) {
    return res.status(400).json({ error: 'Имя слишком длинное' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' })
  }
  if (password.length > 128) {
    return res.status(400).json({ error: 'Пароль слишком длинный' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return res.status(409).json({ error: 'Пользователь уже существует' })
  }

  const hash = await bcrypt.hash(password, 10)
  const id = randomUUID()

  db.prepare('INSERT INTO users (id, username, display_name, password_hash, last_seen) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, displayName, hash, Date.now())

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' })
  return res.json({ token, user: { id, username, displayName, avatar: null } })
})

router.post('/login', async (req: Request, res: Response) => {
  // IMPROVEMENT: rate limiting по IP
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте через 15 минут.' })
  }

  const username = normalizeUsername(req.body.username)
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }

  // FIX: SELECT * заменён на явный список колонок, убран as any
  const user = db.prepare(
    'SELECT id, username, display_name, password_hash, avatar, last_seen FROM users WHERE username = ?'
  ).get(username) as DbUser | undefined

  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

  // Сброс счётчика попыток после успешного входа
  resetRateLimit(ip)

  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id)

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatar: user.avatar
    }
  })
})

export default router
