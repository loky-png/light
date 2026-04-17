# Рекомендации по безопасности Light Messenger

## 🔒 Критические уязвимости (требуют немедленного исправления)

### 1. JWT Secret в коде
**Проблема:** `JWT_SECRET = 'light-secret-change-in-prod'` захардкожен в коде

**Риск:** 🔴 КРИТИЧЕСКИЙ - любой может подделать токены

**Решение:**
```typescript
// light-server/src/index.ts
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required')
}
```

```bash
# .env файл (НЕ коммитить в git!)
JWT_SECRET=ваш_очень_длинный_случайный_секрет_минимум_32_символа
```

---

### 2. CORS настроен на '*'
**Проблема:** `cors: { origin: '*' }` разрешает запросы с любых доменов

**Риск:** 🔴 КРИТИЧЕСКИЙ - CSRF атаки, кража данных

**Решение:**
```typescript
// light-server/src/index.ts
const io = new Server(httpServer, {
  cors: { 
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
    credentials: true
  }
})

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true
}))
```

---

### 3. Нет rate limiting
**Проблема:** Нет ограничений на количество запросов

**Риск:** 🟠 ВЫСОКИЙ - DDoS, спам, брутфорс паролей

**Решение:**
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit'

// Общий лимит
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов
  message: 'Too many requests'
})

// Лимит для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 попыток входа
  message: 'Too many login attempts'
})

app.use('/api/', limiter)
app.use('/api/auth/', authLimiter)
```

---

### 4. Пароли хранятся с bcrypt rounds=10
**Проблема:** 10 раундов - это минимум, рекомендуется 12-14

**Риск:** 🟡 СРЕДНИЙ - возможен брутфорс при утечке базы

**Решение:**
```typescript
// light-server/src/auth.ts
const hash = await bcrypt.hash(password, 12) // было 10
```

---

## 🛡️ Важные улучшения безопасности

### 5. Нет валидации размера аватара на сервере
**Проблема:** Проверка только на клиенте

**Риск:** 🟡 СРЕДНИЙ - можно загрузить огромный файл

**Решение:**
```typescript
// light-server/src/index.ts
app.put('/api/profile', (req, res) => {
  // ...
  if (avatar) {
    // Проверяем что это base64
    if (!avatar.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid avatar format' })
    }
    
    // Проверяем размер (5MB в base64 = ~6.7MB)
    const sizeInBytes = Buffer.from(avatar.split(',')[1], 'base64').length
    if (sizeInBytes > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Avatar too large' })
    }
  }
  // ...
})
```

---

### 6. Нет защиты от XSS
**Проблема:** Сообщения выводятся без санитизации

**Риск:** 🟡 СРЕДНИЙ - возможны XSS атаки

**Решение:**
```bash
npm install dompurify isomorphic-dompurify
```

```typescript
// light-client/src/components/ChatWindow.tsx
import DOMPurify from 'isomorphic-dompurify'

// При отображении сообщения
<span className="message-text">
  {DOMPurify.sanitize(msg.text)}
</span>
```

---

### 7. Нет HTTPS
**Проблема:** Используется HTTP вместо HTTPS

**Риск:** 🟠 ВЫСОКИЙ - перехват трафика, MITM атаки

**Решение:**
```typescript
// light-server/src/index.ts
import https from 'https'
import fs from 'fs'

const httpsServer = https.createServer({
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem')
}, app)

const io = new Server(httpsServer, { /* ... */ })

httpsServer.listen(443, '0.0.0.0', () => {
  console.log('HTTPS server running on port 443')
})
```

Или используйте nginx как reverse proxy с Let's Encrypt.

---

### 8. Нет защиты от SQL Injection в поиске
**Проблема:** Хотя используются prepared statements, нужна дополнительная валидация

**Риск:** 🟢 НИЗКИЙ - но лучше перестраховаться

**Решение:**
```typescript
// light-server/src/index.ts
app.get('/api/users/search', (req, res) => {
  // ...
  const query = (req.query.q as string).replace(/[^a-zA-Z0-9_]/g, '')
  // ...
})
```

---

## 🔐 Дополнительные рекомендации

### 9. Добавить логирование безопасности
```typescript
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'security.log', level: 'warn' })
  ]
})

// Логировать подозрительную активность
logger.warn('Failed login attempt', { username, ip: req.ip })
logger.warn('Rate limit exceeded', { ip: req.ip, endpoint: req.path })
```

---

### 10. Добавить Content Security Policy
```typescript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://yourdomain.com"]
    }
  }
}))
```

---

### 11. Добавить проверку токена на каждый socket event
```typescript
// light-server/src/index.ts
socket.on('message:send', async ({ chatId, text, replyTo }) => {
  // Проверяем что токен все еще валиден
  const user = socket.data.user
  const dbUser = db.prepare('SELECT id FROM users WHERE id = ?').get(user.id)
  if (!dbUser) {
    socket.emit('error', { message: 'Session expired' })
    socket.disconnect()
    return
  }
  // ...
})
```

---

### 12. Добавить 2FA (опционально)
```bash
npm install speakeasy qrcode
```

```typescript
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'

// При включении 2FA
const secret = speakeasy.generateSecret({ name: 'Light Messenger' })
const qrCode = await QRCode.toDataURL(secret.otpauth_url)

// При входе
const verified = speakeasy.totp.verify({
  secret: user.twofa_secret,
  encoding: 'base32',
  token: req.body.token
})
```

---

### 13. Добавить защиту от перебора паролей
```typescript
// Хранить количество неудачных попыток
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()

router.post('/login', async (req, res) => {
  const { username } = req.body
  const attempts = loginAttempts.get(username)
  
  if (attempts && attempts.count >= 5) {
    const timeSince = Date.now() - attempts.lastAttempt
    if (timeSince < 15 * 60 * 1000) { // 15 минут
      return res.status(429).json({ error: 'Too many attempts. Try again later.' })
    }
    loginAttempts.delete(username)
  }
  
  // ... проверка пароля ...
  
  if (!valid) {
    const current = loginAttempts.get(username) || { count: 0, lastAttempt: 0 }
    loginAttempts.set(username, {
      count: current.count + 1,
      lastAttempt: Date.now()
    })
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  
  // Успешный вход - сбрасываем счетчик
  loginAttempts.delete(username)
  // ...
})
```

---

### 14. Добавить валидацию email (если будет)
```bash
npm install validator
```

```typescript
import validator from 'validator'

if (email && !validator.isEmail(email)) {
  return res.status(400).json({ error: 'Invalid email' })
}
```

---

### 15. Регулярный аудит зависимостей
```bash
# Проверка уязвимостей
npm audit

# Автоматическое исправление
npm audit fix

# Обновление зависимостей
npm update

# Использовать Snyk для мониторинга
npm install -g snyk
snyk test
```

---

## 📋 Чеклист безопасности

### Критично (сделать сейчас)
- [ ] Изменить JWT_SECRET на переменную окружения
- [ ] Настроить CORS на конкретные домены
- [ ] Добавить rate limiting
- [ ] Увеличить bcrypt rounds до 12
- [ ] Настроить HTTPS

### Важно (сделать в ближайшее время)
- [ ] Добавить валидацию размера аватара на сервере
- [ ] Добавить санитизацию HTML (XSS защита)
- [ ] Добавить логирование безопасности
- [ ] Добавить Content Security Policy
- [ ] Добавить проверку токена на socket events

### Желательно (сделать когда будет время)
- [ ] Добавить 2FA
- [ ] Добавить защиту от перебора паролей
- [ ] Настроить регулярный аудит зависимостей
- [ ] Добавить мониторинг безопасности
- [ ] Провести penetration testing

---

## 🎯 Приоритеты

1. **Немедленно:** JWT_SECRET, CORS, HTTPS
2. **На этой неделе:** Rate limiting, валидация, логирование
3. **В этом месяце:** 2FA, мониторинг, аудит

---

## 📚 Полезные ресурсы

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Socket.IO Security](https://socket.io/docs/v4/security/)

---

## ⚠️ Важно!

**НЕ ИСПОЛЬЗУЙТЕ В PRODUCTION БЕЗ:**
1. Изменения JWT_SECRET
2. Настройки CORS
3. Настройки HTTPS
4. Rate limiting

Это минимальные требования для безопасности!
