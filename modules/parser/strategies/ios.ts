
import { MessageType } from '../types';

/**
 * Regex for iOS: "[20/06/2021, 14:30:00] Name: Msg"
 * Includes brackets and seconds.
 */
export const IOS_REGEX = {
    // Matches "[20/06/2021, 14:30:00] "
    timestampPrefix: /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}:\d{2})\]\s/,

    // Extracts "Name: Message" from "Name: Message"
    senderAndMessage: /^(.*?):\s(.*)/s,
};

export function parseIOSLine(line: string) {
    const match = line.match(IOS_REGEX.timestampPrefix);
    if (!match) return null;

    const dateStr = match[1];
    const timeStr = match[2];
    const contentStart = match[0].length;
    const body = line.substring(contentStart);

    // Split sender and message
    const senderMatch = body.match(IOS_REGEX.senderAndMessage);

    let sender = 'System';
    let message = body;
    let type: MessageType = 'text';

    if (senderMatch) {
        sender = senderMatch[1];
        message = senderMatch[2];
    } else {
        type = 'system';
    }

    // Detect media omitted
    if (message.includes('<Media omitted>')) {
        type = 'image';
    }

    return {
        dateStr,
        timeStr,
        sender,
        message,
        type,
    };
}
