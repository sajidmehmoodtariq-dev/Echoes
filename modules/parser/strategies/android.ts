
import { MessageType } from '../types';

/**
 * Regex for Android: "20/06/2021, 14:30 - Name: Msg"
 * Note: Date format might vary by locale (DD/MM/YY or MM/DD/YY).
 * We'll start with DD/MM/YY.
 */
export const ANDROID_REGEX = {
    // Matches "20/06/2021, 14:30 - "
    timestampPrefix: /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2})\s-\s/,

    // Extracts "Name: Message" from "Name: Message"
    // Needs to handle system messages which don't have "Name: "
    senderAndMessage: /^(.*?):\s(.*)/s,

    // System messages often don't have a colon after the sender, or no sender at all.
    // "Messages to this group are now secured with end-to-end encryption."
    // "You created group 'Family Group'"
};

export function parseAndroidLine(line: string) {
    const match = line.match(ANDROID_REGEX.timestampPrefix);
    if (!match) return null;

    const dateStr = match[1];
    const timeStr = match[2];
    const contentStart = match[0].length;
    const body = line.substring(contentStart);

    // Split sender and message
    const senderMatch = body.match(ANDROID_REGEX.senderAndMessage);

    let sender = 'System';
    let message = body;
    let type: MessageType = 'text';

    if (senderMatch) {
        sender = senderMatch[1];
        message = senderMatch[2];
    } else {
        // System message
        type = 'system';
    }

    // Detect media omitted
    if (message.includes('<Media omitted>')) {
        type = 'image'; // Generic media type, could be video/audio
        // We can't distinguish without file extension which is lost in "Media omitted"
    }

    return {
        dateStr,
        timeStr,
        sender,
        message,
        type,
    };
}
