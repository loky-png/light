import Database from 'better-sqlite3'
import path from 'path'

const db = new Database(path.join(__dirname, '..', 'light.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    public_key TEXT,
    avatar TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'direct',
    name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read INTEGER DEFAULT 0,
    reply_to TEXT
  );

  CREATE TABLE IF NOT EXISTS hidden_messages (
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS hidden_chats (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    hidden_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  );

  -- Индексы для ускорения запросов
  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(chat_id, read, sender_id);
  CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_members_chat_id ON chat_members(chat_id);
  CREATE INDEX IF NOT EXISTS idx_hidden_messages_user_id ON hidden_messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_hidden_messages_message_id ON hidden_messages(message_id);
  CREATE INDEX IF NOT EXISTS idx_hidden_chats_user_id ON hidden_chats(user_id);
  CREATE INDEX IF NOT EXISTS idx_hidden_chats_chat_id ON hidden_chats(chat_id);
`)

// Добавляем колонку avatar если её нет
try {
  db.prepare('ALTER TABLE users ADD COLUMN avatar TEXT').run()
  console.log('Added avatar column to users table')
} catch (e) {
  // Колонка уже существует
}

// Добавляем колонку last_seen если её нет
try {
  db.prepare('ALTER TABLE users ADD COLUMN last_seen INTEGER DEFAULT 0').run()
  console.log('Added last_seen column to users table')
} catch (e) {
  // Колонка уже существует
}

// Добавляем колонку reply_to если её нет
try {
  db.prepare('ALTER TABLE messages ADD COLUMN reply_to TEXT').run()
  console.log('Added reply_to column to messages table')
} catch (e) {
  // Колонка уже существует
}

// Миграция: конвертируем старые timestamps из секунд в миллисекунды
try {
  const needsMigration = db.prepare('SELECT COUNT(*) as count FROM messages WHERE created_at < 2000000000').get() as { count: number }
  
  if (needsMigration.count > 0) {
    console.log(`Migrating ${needsMigration.count} messages from seconds to milliseconds...`)
    
    db.transaction(() => {
      // Умножаем на 1000 все timestamps которые явно в секундах (< 2033 года)
      db.prepare('UPDATE messages SET created_at = created_at * 1000 WHERE created_at < 2000000000').run()
      db.prepare('UPDATE chats SET created_at = created_at * 1000 WHERE created_at < 2000000000').run()
      db.prepare('UPDATE users SET created_at = created_at * 1000 WHERE created_at < 2000000000').run()
      db.prepare('UPDATE users SET last_seen = last_seen * 1000 WHERE last_seen > 0 AND last_seen < 2000000000').run()
      db.prepare('UPDATE hidden_chats SET hidden_at = hidden_at * 1000 WHERE hidden_at < 2000000000').run()
    })()
    
    console.log('Migration completed!')
  }
} catch (e) {
  console.error('Migration error:', e)
}

// ПРИМЕЧАНИЕ: SQLite не поддерживает добавление FOREIGN KEY к существующим таблицам
// Для новых установок рекомендуется пересоздать таблицы с CASCADE:
// CREATE TABLE hidden_messages (
//   message_id TEXT NOT NULL,
//   user_id TEXT NOT NULL,
//   PRIMARY KEY (message_id, user_id),
//   FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
// );

export default db
