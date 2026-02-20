import { detectMessageType } from './detectors';
import { sanitizeContent } from './sanitizer';
import { ANDROID_REGEX } from './strategies/android';
import { IOS_REGEX } from './strategies/ios';
import { Chat, Message, Platform } from './types';

export interface ParseResult {
    chat: Chat;
    messages: Message[];
    senders: Set<string>;
    warnings: string[];
}

/**
 * Main parser module for WhatsApp chat exports.
 * Processes the entire raw text string line by line.
 * 
 * @param rawText The full string content of the .txt export
 * @param fileName The name of the imported file (used for Chat mapping)
 * @returns ParseResult containing structured messages, senders, and metadata
 */
export function parseWhatsAppChat(rawText: string, fileName: string = 'Imported Chat'): ParseResult {
    const messages: Message[] = [];
    const senders = new Set<string>();
    const warnings: string[] = [];

    let platform: Platform = 'unknown';
    let lastMessage: Message | null = null;
    let currentLineNumber = 0;

    // Split raw text into lines. Handles both Windows (\r\n) and Unix (\n) line endings.
    const lines = rawText.split(/\r?\n/);

    for (const rawLine of lines) {
        currentLineNumber++;

        // Skip completely empty lines if we aren't inside a message, 
        // though usually we want to preserve empty lines inside multi-line messages.
        if (rawLine.trim() === '' && !lastMessage) {
            continue;
        }

        const unSanitizedLine = rawLine; // Keep original for debug
        const line = sanitizeContent(rawLine);

        // 1. Detect platform format on the first valid line
        if (platform === 'unknown') {
            if (ANDROID_REGEX.timestampPrefix.test(line)) platform = 'android';
            else if (IOS_REGEX.timestampPrefix.test(line)) platform = 'ios';

            // If we still don't know the platform and we've read 50 lines, it might be a bad file
            if (platform === 'unknown' && currentLineNumber > 50) {
                warnings.push(`File format not recognized by line 50. Ensure this is a valid WhatsApp export.`);
                break; // Stop parsing to avoid infinite junk loops
            }

            // If still unknown on early lines, skip (might be header lines)
            if (platform === 'unknown') continue;
        }

        // 2. Extract Timestamp and Body based on detected platform
        let match = null;
        let senderStr = 'System';
        let messageBody = '';
        let timestampStr = '';
        let dateStr = '';
        let timeStr = '';

        if (platform === 'android') {
            match = line.match(ANDROID_REGEX.timestampPrefix);
        } else if (platform === 'ios') {
            match = line.match(IOS_REGEX.timestampPrefix);
        }

        // 3. Process Line
        if (match) {
            // It's a NEW message
            dateStr = match[1];
            timeStr = match[2];
            timestampStr = `${dateStr} ${timeStr}`;

            const bodyPart = line.substring(match[0].length);

            // Check for sender format ("Name: Message") vs System message
            const senderMatch = platform === 'android'
                ? bodyPart.match(ANDROID_REGEX.senderAndMessage)
                : bodyPart.match(IOS_REGEX.senderAndMessage);

            if (senderMatch) {
                senderStr = senderMatch[1];
                messageBody = senderMatch[2];
            } else {
                // No colon means it's a system message (e.g. "Alice changed the subject")
                senderStr = 'System';
                messageBody = bodyPart;
            }

            // Track unique senders
            if (senderStr !== 'System') {
                senders.add(senderStr);
            }

            // Determine the precise message type
            const type = detectMessageType(messageBody, senderStr);

            const newMessage: Message = {
                id: currentLineNumber, // Temporary proxy ID
                chatId: 0, // Placeholder, DB will assign
                timestamp: parseDate(dateStr, timeStr),
                content: messageBody,
                type: type,
                isMediaOmitted: type === 'image' && messageBody.includes('omitted'),
                senderId: 0, // Placeholder, bound later
                rawText: unSanitizedLine, // Store original raw for debugging module 1 later
            };

            // Hack to retain raw sender name string for DB syncing
            (newMessage as any)._rawSender = senderStr;

            messages.push(newMessage);
            lastMessage = newMessage;

        } else {
            // 4. It's a CONTINUATION of the previous message
            if (lastMessage) {
                // Notice we append the sanitized line to avoid invisible artifacts breaking string concatenation.
                lastMessage.content += '\n' + line;

                // Update rawText for accuracy (using original string)
                if (lastMessage.rawText) {
                    lastMessage.rawText += '\n' + unSanitizedLine;
                }

                // Continually running `detectMessageType` on multi-line text is unnecessary,
                // unless it's a multiline system message, which is extremely rare.
            } else {
                if (line.trim() !== '') {
                    warnings.push(`Line ${currentLineNumber} skipped: Orphaned line before first message.`);
                }
            }
        }
    }

    return {
        chat: {
            id: 0,
            name: fileName.replace('.txt', ''),
            sourcePlatform: platform,
            importDate: Date.now(),
        },
        messages,
        senders,
        warnings
    };
}

/**
 * Robust date parser for standard WhatsApp formats.
 * Expected Android: DD/MM/YY or DD/MM/YYYY, HH:mm(AM/PM)
 * Expected iOS: [DD/MM/YY or DD/MM/YYYY, HH:mm:ss(AM/PM)]
 */
function parseDate(dateStr: string, timeStr: string): number {
    const normalizedDate = dateStr.replace(/[.-]/g, '/');
    const timeParts = timeStr.match(/(\d+):(\d+)(?::(\d+))?\s*([AaPp][Mm])?/i);

    let hours = 0; let mins = 0; let secs = 0;

    if (timeParts) {
        hours = parseInt(timeParts[1], 10);
        mins = parseInt(timeParts[2], 10);
        secs = timeParts[3] ? parseInt(timeParts[3], 10) : 0;

        const ampm = timeParts[4]?.toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
    }

    const dateParts = normalizedDate.split('/');
    if (dateParts.length === 3) {
        let p1 = parseInt(dateParts[0], 10);
        let p2 = parseInt(dateParts[1], 10);
        let year = parseInt(dateParts[2], 10);

        // Handle 2 digit year (assume 2000s)
        if (year < 100) year += 2000;

        // Heuristic: If p1 > 12, it MUST be DD (DD/MM/YYYY)
        // If p2 > 12, it MUST be MM/DD/YYYY
        let day = p1, month = p2 - 1;

        if (p1 > 12) {
            day = p1;
            month = p2 - 1;
        } else if (p2 > 12) {
            month = p1 - 1;
            day = p2;
        } else {
            // Ambiguous (e.g. 10/11/2021). 
            // In many non-US countries WhatsApp exports default to DD/MM.
            // When in doubt, fallback to DD/MM.
            day = p1;
            month = p2 - 1;
        }

        const d = new Date(year, month, day, hours, mins, secs);
        if (!isNaN(d.getTime())) return d.getTime();
    }

    return Date.now(); // Ultimate fallback
}

export * from './detectors';
export * from './sanitizer';
export * from './types';

