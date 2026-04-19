# 🔍 Глубокий анализ кодовой базы Light Messenger

**Дата анализа:** 19 апреля 2026  
**Версия:** Stable (коммит 8faf606)

---

## 🟢 КРИТИЧЕСКИЕ БАГИ (требуют немедленного исправления)

### 1. ❌ **Смешанные единицы времени (секунды/миллисекунды)**

**Файл:** `light-server/src/index.ts`

**Проблема:**
```typescript
// Строка 238: cleanupOldMessages использует секунды
const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60)

// Строка 672: message:send использует секунды
const createdAt = Math.floor(Date.now() / 1000)

// НО: везде в клиенте ожидаются миллисекунды!
// Строка 60 ChatWindow.tsx:
createdAt: new Date(m.created_at * 1000) // умножаем на 1000!
```

**Последствия:**
- Сообщения отображаются с неправильным временем
- Очистка старых сообщений работает некорректно
- Несоответствие между БД и клиентом

**Решение:**
Использовать миллисекунды везде:
```typescript
const createdAt = Date.now() // вместо Math.floor(Date.now() / 1000)
```

---

### 2. ❌ **Отсутствие обработчика disconnect для очистки onlineUsers**

**Файл:** `light-server/src/index.ts` (строка 730)

**Проблема:**
```typescript
socket.on('disconnect', () => {
  // ... код есть, НО:
  currentState.socketIds.delete(socket.id)
  currentState.lastSeen = disconnectTime
  onlineUsers.set(user.id, currentState) // ❌ НЕ УДАЛЯЕТ из Map!
  
  // Удаление происходит только через 5 минут в setTimeout
})
```

**Последствия:**
- Утечка памяти при множественных подключениях/отключениях
- Пользователи остаются "онлайн" после отключения
- Map `onlineUsers` растёт бесконечно

**Решение:**
```typescript
if (currentState.socketIds.size === 0) {
  onlineUsers.delete(user.id) // удалить сразу
}
```

---

### 3. ❌ **touchUserLastSeen вызывается при каждом ping**

**Файл:** `light-server/src/index.ts` (строка 72)

**Проблема:**
```typescript
function touchUserLastSeen(userId: string, timestamp = Date.now()) {
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(timestamp, userId)
  // ❌ Запись в БД при КАЖДОМ вызове!
}

socket.on('ping', (timestamp: number) => {
  touchUserLastSeen(user.id, pingTime) // вызывается каждые несколько секунд
})
```

**Последствия:**
- Огромная нагрузка на БД (сотни записей в секунду)
- Износ SSD при использовании SQLite
- Замедление работы сервера

**Решение:**
Дебаунсинг - записывать максимум раз в 5-10 секунд:
```typescript
const lastWrite = new Map<string, number>()

function touchUserLastSeen(userId: string, timestamp = Date.now()) {
  const last = lastWrite.get(userId) ?? 0
  if (timestamp - last < 5000) return // пропускаем
  
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(timestamp, userId)
  lastWrite.set(userId, timestamp)
}
```

---

### 4. ❌ **CORS открыт для всех доменов**

**Файл:** `light-server/src/index.ts` (строка 34)

**Проблема:**
```typescript
const io = new Server(httpServer, {
  cors: { origin: '*' } // ❌ ЛЮБОЙ домен может подключиться!
})

app.use(cors()) // ❌ ЛЮБОЙ домен может делать запросы!
```

**Последствия:**
- CSRF атаки
- Злоумышленники могут использовать ваш API
- Утечка данных пользователей

**Решение:**
```typescript
const allowedOrigins = ['http://localhost:5173', 'https://yourdomain.com']
app.use(cors({ origin: allowedOrigins }))
```

---

### 5. ❌ **Отсутствие rate limiting**

**Файл:** `light-server/src/index.ts`

**Проблема:**
Нет ограничения количества запросов с одного IP

**Последствия:**
- Brute force атаки на /api/auth
- DDoS атаки
- Спам сообщений

**Решение:**
Добавить `express-rate-limit`:
```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
})
app.use('/api', limiter)
```

---

## 🟡 СРЕДНИЕ БАГИ (важно исправить)

### 6. ⚠️ **hidden_chats.hidden_at в секундах, остальное в миллисекундах**

**Файл:** `light-server/src/index.ts` (строка 408)

```typescript
db.prepare('INSERT OR REPLACE INTO hidden_chats (chat_id, user_id, hidden_at) VALUES (?, ?, ?)')
  .run(chatId, user.id, Math.floor(Date.now() / 1000)) // ❌ секунды!
```

**Решение:** Использовать `Date.now()` без деления

---

### 7. ⚠️ **Отсутствие индексов для частых запросов**

**Файл:** `light-server/src/db.ts`

**Проблема:**
Нет индекса для подсчёта непрочитанных сообщений:
```sql
SELECT COUNT(*) FROM messages 
WHERE chat_id = ? AND read = 0 AND sender_id != ?
```

**Решение:**
```sql
CREATE INDEX idx_messages_unread ON messages(chat_id, read, sender_id);
```

---

### 8. ⚠️ **Отсутствие ON DELETE CASCADE**

**Файл:** `light-server/src/db.ts`

**Проблема:**
При удалении сообщения остаются записи в `hidden_messages`

**Решение:**
```sql
CREATE TABLE hidden_messages (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
```

---

### 9. ⚠️ **Нет проверки прав при удалении сообщений**

**Файл:** `light-server/src/index.ts` (строка 798)

**Проблема:**
```typescript
socket.on('message:delete', ({ chatId, messageId, forEveryone }) => {
  // ...
  if (forEveryone) {
    if (message.sender_id !== user.id) {
      // ✅ Проверка есть
    }
  }
  // ❌ НО: нет проверки, что пользователь вообще в чате!
})
```

**Решение:**
Добавить проверку членства в чате перед удалением

---

### 10. ⚠️ **XSS уязвимость через аватары**

**Файл:** `light-server/src/index.ts` (строка 330)

**Проблема:**
```typescript
if (avatar && !avatar.startsWith('data:image/')) {
  return res.status(400).json({ error: 'Avatar must be an image data URL' })
}
// ❌ Принимает data:image/svg+xml - можно внедрить JavaScript!
```

**Решение:**
```typescript
if (avatar && !avatar.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,/)) {
  return res.status(400).json({ error: 'Only PNG, JPEG, WEBP, GIF allowed' })
}
```

---

## 🔵 НИЗКИЕ БАГИ (можно исправить позже)

### 11. 📝 **Неправильный текст кнопки темы**

**Файл:** `light-client/src/components/Sidebar.tsx` (строка 371)

```typescript
<button className="settings-toggle" onClick={toggleTheme}>
  {theme === 'dark' ? 'Тёмная' : 'Светлая'}
  {/* ❌ Показывает текущую тему, а не ту, на которую переключится */}
</button>
```

**Решение:**
```typescript
{theme === 'dark' ? 'Светлая' : 'Тёмная'}
```

---

### 12. 📝 **Отсутствие пагинации сообщений**

**Файл:** `light-server/src/index.ts` (строка 590)

```typescript
SELECT ... FROM messages ... LIMIT 100
// ❌ Всегда последние 100, нельзя загрузить старые
```

**Решение:**
Добавить параметры `offset` и `limit`

---

### 13. 📝 **Неконтролируемые чекбоксы в настройках**

**Файл:** `light-client/src/components/Sidebar.tsx` (строка 363)

```typescript
<input type="checkbox" defaultChecked />
// ❌ Неконтролируемый компонент, состояние не сохраняется
```

**Решение:**
```typescript
<input type="checkbox" checked={sendOnEnter} onChange={...} />
```

---

### 14. 📝 **Отсутствие валидации текста сообщений**

**Файл:** `light-server/src/index.ts` (строка 672)

**Проблема:**
Текст сообщений не очищается от HTML/скриптов

**Решение:**
```typescript
const sanitizedText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
```

---

### 15. 📝 **Memory leak в useEffect**

**Файл:** `light-client/src/components/Sidebar.tsx` (строка 68)

```typescript
searchTimeoutRef.current = window.setTimeout(async () => {
  // ...
}, 300)
// ❌ При размонтировании компонента таймер не очищается
```

**Решение:**
```typescript
useEffect(() => {
  return () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
  }
}, [])
```

---

## ✅ ЧТО РАБОТАЕТ ХОРОШО

1. ✅ **Socket.io интеграция** - правильная обработка событий
2. ✅ **Кеширование сообщений** - сохранение в App.tsx
3. ✅ **Сохранение позиции скролла** - восстановление при возврате в чат
4. ✅ **Индикаторы прочтения** - двойные галочки работают
5. ✅ **Ответы на сообщения** - реализованы корректно
6. ✅ **Контекстные меню** - удобный UX
7. ✅ **Темная тема** - переключение работает
8. ✅ **Транзакции БД** - используются для атомарности
9. ✅ **JWT авторизация** - безопасная аутентификация
10. ✅ **Electron интеграция** - десктопное приложение работает

---

## 📊 СТАТИСТИКА

| Категория | Количество |
|-----------|------------|
| Критические баги | 5 |
| Средние баги | 5 |
| Низкие баги | 5 |
| Всего проблем | 15 |

---

## 🎯 ПРИОРИТЕТЫ ИСПРАВЛЕНИЯ

### Неделя 1 (критично):
1. Исправить timestamps (секунды → миллисекунды)
2. Добавить дебаунсинг touchUserLastSeen
3. Ограничить CORS
4. Исправить очистку onlineUsers

### Неделя 2 (важно):
5. Добавить rate limiting
6. Добавить индексы БД
7. Исправить XSS через аватары
8. Добавить ON DELETE CASCADE

### Неделя 3 (улучшения):
9. Исправить текст кнопки темы
10. Добавить пагинацию
11. Санитизация текста
12. Исправить memory leaks

---

## 🔒 БЕЗОПАСНОСТЬ

**Текущий уровень:** ⚠️ СРЕДНИЙ

**Основные риски:**
- CORS открыт для всех
- Нет rate limiting
- XSS через SVG аватары
- Нет санитизации текста

**Рекомендации:**
1. Закрыть CORS
2. Добавить rate limiting
3. Ограничить типы изображений
4. Добавить Content Security Policy

---

## 📈 ПРОИЗВОДИТЕЛЬНОСТЬ

**Текущий уровень:** ⚠️ СРЕДНИЙ

**Узкие места:**
- Запись в БД при каждом ping (сотни раз в секунду)
- Отсутствие индексов для частых запросов
- Нет пагинации (всегда загружается 100 сообщений)

**Рекомендации:**
1. Дебаунсинг записей в БД
2. Добавить индексы
3. Реализовать пагинацию
4. Кешировать статусы пользователей

---

## 🎨 UX/UI

**Текущий уровень:** ✅ ХОРОШИЙ

**Что работает:**
- Плавные анимации
- Адаптивный дизайн
- Темная тема
- Контекстные меню

**Что улучшить:**
- Добавить индикатор загрузки при отправке
- Подтверждение удаления сообщений
- Визуальное отличие отредактированных сообщений
- Анимации появления/исчезновения

---

**Общий вывод:** Проект в целом стабилен, но требует исправления критических багов с timestamps и производительностью БД. После исправления топ-5 проблем можно считать production-ready.
