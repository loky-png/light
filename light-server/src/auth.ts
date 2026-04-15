import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import db from './db'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'light-secret-change-in-prod'

router.post('/register', async (req: Request, res: Response) => {
  const { username, password, displayName } = req.body
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Заполните все поля' })
  }
  if (username.length < 4) {
    return res.status(400).json({ error: 'Юзернейм минимум 4 символа' })
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Юзернейм только латинские буквы, цифры и _' })
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return res.status(409).json({ error: 'Пользователь уже существует' })

  const hash = await bcrypt.hash(password, 10)
  const id = randomUUID()
  db.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, username, displayName, hash)

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' })
  return res.json({ token, user: { id, username, displayName } })
})

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' })

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Неверный логин или пароль' })

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' })
  return res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name } })
})

export default router
