
import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'whatsapp_archive.db';

export const db = SQLite.openDatabaseSync(DATABASE_NAME);

export async function initDatabase() {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_platform TEXT, -- 'ios' | 'android' | 'unknown'
      import_date INTEGER NOT NULL,
      file_path TEXT,
      metadata JSON
    );

    CREATE TABLE IF NOT EXISTS senders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES senders(id),
      timestamp INTEGER NOT NULL,
      content TEXT,
      type TEXT NOT NULL,
      is_media_omitted BOOLEAN DEFAULT 0,
      media_uri TEXT,
      reply_to_id INTEGER,
      sentiment_score REAL,
      is_meaningful BOOLEAN DEFAULT 0,
      raw_text TEXT,
      FOREIGN KEY (sender_id) REFERENCES senders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

    -- FTS5 Virtual Table for Search
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, 
        content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);

  console.log('Database initialized successfully');
}
