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
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'direct',
    name TEXT,
    created_at INTEGER DEFAULT (unixepoch())
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
    created_at INTEGER DEFAULT (unixepoch()),
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
    hidden_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (chat_id, user_id)
  );

  -- Индексы для ускорения запросов
  CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
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

export default db
