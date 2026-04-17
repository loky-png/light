import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import db from './db'
import { JWT_SECRET } from './config'

const router = Router()

function normalizeUsername(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLowerCase() : ''
}

function normalizeDisplayName(displayName: unknown): string {
  return typeof displayName === 'string' ? displayName.trim() : ''
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
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Юзернейм только латинские буквы, цифры и _' })
  }
  if (displayName.length > 100) {
    return res.status(400).json({ error: 'Имя слишком длинное' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' })
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
  const username = normalizeUsername(req.body.username)
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!username || !password) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Неверный логин или пароль' })
  }

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
