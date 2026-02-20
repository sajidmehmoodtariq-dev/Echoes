
import { readLinesInChunks } from './readers/chunkReader';
import { ANDROID_REGEX, parseAndroidLine } from './strategies/android';
import { IOS_REGEX, parseIOSLine } from './strategies/ios';
import { Chat, Message, Platform } from './types';

export interface ParseResult {
    chat: Chat;
    messages: Message[];
    senders: Set<string>;
}

export async function parseChatFile(
    fileUri: string,
    fileName: string,
    onProgress?: (progress: number) => void
): Promise<ParseResult> {

    let platform: Platform = 'unknown';
    const messages: Message[] = [];
    const senders = new Set<string>();

    let lastMessage: Message | null = null;
    let lineCount = 0;

    await readLinesInChunks(fileUri, async (lines) => {
        for (const line of lines) {
            lineCount++;

            // 1. Detect platform from first few valid lines if unknown
            if (platform === 'unknown') {
                if (ANDROID_REGEX.timestampPrefix.test(line)) platform = 'android';
                else if (IOS_REGEX.timestampPrefix.test(line)) platform = 'ios';
            }

            // 2. Parse based on platform
            let parsedLine = null;
            if (platform === 'android') parsedLine = parseAndroidLine(line);
            else if (platform === 'ios') parsedLine = parseIOSLine(line);

            if (parsedLine) {
                // New Message Found
                if (parsedLine.sender !== 'System') {
                    senders.add(parsedLine.sender);
                }

                // TODO: finish previous message integration?
                // Actually we just push the previous one when we find a new one? 
                // Or we push immediately and update if we find continuation?
                // Pushing immediately is safer for memory, but we need to append to `lastMessage` if continuation.

                // Finalize last message (if any) - actually we don't need to "finalize" in JS objects,
                // we can just keep a reference to it and mutate its content if the next line is a continuation.

                const newMessage: Message = {
                    id: lineCount, // Temporary ID, will be DB ID later
                    chatId: 0, // Placeholder
                    timestamp: parseDate(parsedLine.dateStr, parsedLine.timeStr),
                    content: parsedLine.message,
                    type: parsedLine.type as any,
                    isMediaOmitted: false,
                    senderId: 0, // Placeholder
                    // We store the raw sender name temporarily in a non-standard field or separate map
                    // ensuring we can link it later. 
                    // For now let's just use the 'content' field for system messages? 
                    // No, we need a way to link unique senders.
                };

                // *Hack*: Attach raw sender name to the message object for now so we can resolving it later
                (newMessage as any)._rawSender = parsedLine.sender;

                messages.push(newMessage);
                lastMessage = newMessage;

            } else {
                // Continuation of previous message
                if (lastMessage) {
                    lastMessage.content += '\n' + line;
                }
            }
        }
    }, onProgress);

    return {
        chat: {
            id: 0,
            name: fileName.replace('.txt', ''),
            sourcePlatform: platform,
            importDate: Date.now(),
        },
        messages,
        senders
    };
}

// Helper to parse date
function parseDate(dateStr: string, timeStr: string): number {
    // TODO: rigorous date parsing for DD/MM vs MM/DD
    // For now assuming DD/MM/YYYY
    // ...
    return Date.now(); // Placeholder
}
