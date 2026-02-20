import * as SQLite from 'expo-sqlite';
import { ParseResult } from '../modules/parser/index';
import { Chat, Message } from '../modules/parser/types';

// We export the types here for convenience
export type { Chat, Message, MessageType, Platform, Sender } from '../modules/parser/types';

export const DATABASE_NAME = 'whatsapp_archive.db';
export const db = SQLite.openDatabaseSync(DATABASE_NAME);

/**
 * Initializes the database schema.
 * Creates necessary tables and virtual FTS5 tables for fast searching.
 */
export async function initDatabase(): Promise<void> {
    await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_platform TEXT, 
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

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, 
        content_rowid='id'
    );

    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;

    CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.id;
    END;
    CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
        UPDATE messages_fts SET content = new.content WHERE rowid = old.id;
    END;
  `);

    console.log('Database initialized successfully in db.ts');
}

/**
 * Fetches all imported chats ordered by the most recently imported first.
 */
export async function getChats(): Promise<Chat[]> {
    return await db.getAllAsync<Chat>(
        `SELECT id, name, source_platform as sourcePlatform, import_date as importDate, file_path, metadata 
         FROM chats ORDER BY import_date DESC`
    );
}

/**
 * Fetches paginated messages for a specific chat.
 * Ordered chronologically for the chat viewer UI.
 */
export async function getMessages(chatId: number, limit: number = 50, offset: number = 0): Promise<(Message & { senderName?: string })[]> {
    return await db.getAllAsync<Message & { senderName?: string }>(`
        SELECT 
            m.id, m.chat_id as chatId, m.sender_id as senderId, 
            m.timestamp, m.content, m.type, 
            m.is_media_omitted as isMediaOmitted, 
            m.media_uri as mediaUri, m.reply_to_id as replyToId,
            m.sentiment_score as sentimentScore, m.is_meaningful as isMeaningful,
            s.name as senderName
        FROM messages m
        LEFT JOIN senders s ON m.sender_id = s.id
        WHERE m.chat_id = ?
        ORDER BY m.timestamp ASC
        LIMIT ? OFFSET ?
    `, [chatId, limit, offset]);
}

/**
 * Core insertion function. Wrapped in a transaction for extreme performance.
 * Expo SQLite transactions process prepared statements synchronously in native code.
 */
export async function insertParsedChat(parsedData: ParseResult): Promise<number> {
    const { chat, senders, messages } = parsedData;
    let insertedChatId = 0;

    await db.withTransactionAsync(async () => {
        // 1. Insert Chat Meta
        const chatResult = await db.runAsync(
            `INSERT INTO chats (name, source_platform, import_date) VALUES (?, ?, ?)`,
            [chat.name, chat.sourcePlatform, chat.importDate]
        );
        insertedChatId = chatResult.lastInsertRowId;

        // 2. Resolve Senders
        const senderNameToIdMap = new Map<string, number>();
        for (const senderName of Array.from(senders)) {
            await db.runAsync(`INSERT OR IGNORE INTO senders (name) VALUES (?)`, [senderName]);
            const senderRow = await db.getFirstAsync<{ id: number }>(`SELECT id FROM senders WHERE name = ?`, [senderName]);
            if (senderRow) senderNameToIdMap.set(senderName, senderRow.id);
        }

        // 3. Batch Insert Messages
        const statement = await db.prepareAsync(`
            INSERT INTO messages (
                chat_id, sender_id, timestamp, content, type, is_media_omitted, raw_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        try {
            for (const msg of messages) {
                const rawSender = (msg as any)._rawSender;
                const dbSenderId = (rawSender !== 'System' && senderNameToIdMap.has(rawSender))
                    ? senderNameToIdMap.get(rawSender)!
                    : null;

                await statement.executeAsync([
                    insertedChatId,
                    dbSenderId,
                    msg.timestamp,
                    msg.content,
                    msg.type,
                    msg.isMediaOmitted ? 1 : 0,
                    msg.rawText || ''
                ]);
            }
        } finally {
            await statement.finalizeAsync();
        }
    });

    return insertedChatId;
}

/**
 * Deletes a chat and all its associated messages from the database.
 * The foreign key ON DELETE CASCADE handles deleting the messages automatically.
 */
export async function deleteChatById(chatId: number): Promise<void> {
    await db.runAsync(`DELETE FROM chats WHERE id = ?`, [chatId]);
}
