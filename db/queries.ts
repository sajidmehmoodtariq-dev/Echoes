import { ParseResult } from '../modules/parser/index';
import { db } from './client';

/**
 * Initializes the database if not already done.
 */
export async function setupDatabase() {
    // Ensuring tables exist (handled by client.ts, but good to ensure execution order)
    const { initDatabase } = require('./client');
    await initDatabase();
}

/**
 * Saves a completely parsed WhatsApp chat export into the SQLite database.
 * Uses a single transaction to ensure data integrity.
 * 
 * @param parsedData The result from `parseWhatsAppChat`
 */
export async function saveImportedChat(parsedData: ParseResult): Promise<number> {
    const { chat, senders, messages } = parsedData;
    let insertedChatId = 0;

    try {
        // Run everything inside an exclusive transaction
        await db.withTransactionAsync(async () => {
            // 1. Insert the Chat
            const chatResult = await db.runAsync(
                `INSERT INTO chats (name, source_platform, import_date) VALUES (?, ?, ?)`,
                [chat.name, chat.sourcePlatform, chat.importDate]
            );
            insertedChatId = chatResult.lastInsertRowId;

            // 2. Insert Senders and build a lookup map
            // Senders must be unique in DB. So we insert OR ignore, then lookup their IDs.
            const senderNameToIdMap = new Map<string, number>();

            for (const senderName of Array.from(senders)) {
                // Insert if not exists
                await db.runAsync(
                    `INSERT OR IGNORE INTO senders (name) VALUES (?)`,
                    [senderName]
                );
                // Get the ID (either newly inserted or existing)
                const senderRow = await db.getFirstAsync<{ id: number }>(
                    `SELECT id FROM senders WHERE name = ?`,
                    [senderName]
                );

                if (senderRow) {
                    senderNameToIdMap.set(senderName, senderRow.id);
                }
            }

            // 3. Insert Messages in bulk
            // Using a prepared statement for performance over thousands of messages
            const statement = await db.prepareAsync(`
                INSERT INTO messages (
                    chat_id, sender_id, timestamp, content, type, is_media_omitted, media_uri, raw_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            try {
                for (const msg of messages) {
                    // Resolve the DB senderId from the raw string we tracked
                    const rawSender = (msg as any)._rawSender;
                    let dbSenderId: number | null = null;

                    if (rawSender !== 'System' && senderNameToIdMap.has(rawSender)) {
                        dbSenderId = senderNameToIdMap.get(rawSender)!;
                    }

                    await statement.executeAsync([
                        insertedChatId,
                        dbSenderId, // null for system messages
                        msg.timestamp,
                        msg.content,
                        msg.type,
                        msg.isMediaOmitted ? 1 : 0,
                        msg.mediaUri || null,
                        msg.rawText || ''
                    ]);
                }
            } finally {
                await statement.finalizeAsync();
            }
        });

        return insertedChatId;
    } catch (error) {
        console.error("Failed to save imported chat to database:", error);
        throw error;
    }
}
