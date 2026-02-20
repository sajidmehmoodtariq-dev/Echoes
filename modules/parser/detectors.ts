import { MessageType } from './types';

/**
 * Robustly detects the type of message based on its content.
 * WhatsApp exports replace media with specific localized strings.
 * This handles common English export formats.
 * 
 * @param content The message body text
 * @param sender The sender name (if 'System', we already know it's a system message)
 * @returns The determined MessageType
 */
export function detectMessageType(content: string, sender: string): MessageType {
    if (sender === 'System') {
        // System messages ("Messages to this group are now secured...")
        return 'system';
    }

    const lowerContent = content.toLowerCase();

    // 1. Omitted Media (User chose "Export without Media")
    if (lowerContent.includes('<media omitted>')) {
        // Without the actual file, we default to 'image' as a fallback, 
        // though it could be video/audio. The schema supports generic handling.
        return 'image';
    }

    // 2. Attached Media (User chose "Attach Media", leaves filenames in text)
    // Examples: "IMG-20231025-WA0001.jpg (file attached)"
    //           "VID-20231025-WA0001.mp4 (file attached)"
    //           "AUD-20231025-WA0001.opus (file attached)"
    //           "PTT-20231025-WA0001.opus (file attached)" // Push to talk (Voice Note)
    //           "DOC-20231025-WA0001.pdf (file attached)"
    //           "location.vcf (file attached)"
    if (lowerContent.includes('(file attached)')) {
        if (lowerContent.includes('.jpg') || lowerContent.includes('.jpeg') || lowerContent.includes('.png')) {
            return 'image';
        }
        if (lowerContent.includes('.mp4') || lowerContent.includes('.mov')) {
            return 'video';
        }
        if (lowerContent.includes('.opus') || lowerContent.includes('.mp3') || lowerContent.includes('.m4a') || lowerContent.includes('.wav') || lowerContent.includes('.ogg')) {
            if (lowerContent.includes('ptt-') || lowerContent.includes('audio omitted')) {
                return 'audio'; // Voice notes
            }
            return 'audio';
        }
        if (lowerContent.includes('.webp')) {
            return 'sticker';
        }
        if (lowerContent.includes('.vcf')) {
            return 'contact';
        }
        if (lowerContent.includes('.pdf') || lowerContent.includes('.doc') || lowerContent.includes('.xls') || lowerContent.includes('.txt')) {
            return 'document';
        }
        // Fallback for unknown attachments
        return 'document';
    }

    // 3. Deleted Messages
    if (
        lowerContent === 'this message was deleted' ||
        lowerContent === 'you deleted this message'
    ) {
        return 'deleted';
    }

    // 4. Calls
    if (
        lowerContent.includes('missed voice call') ||
        lowerContent.includes('missed video call')
    ) {
        return 'call_log';
    }

    // 5. Locations
    // Usually shared as Google Maps links or "location: https://maps.google.com/..."
    if (
        lowerContent.includes('maps.google.com') ||
        lowerContent.includes('maps.apple.com') ||
        lowerContent.startsWith('location: ') ||
        lowerContent.includes('live location')
    ) {
        return 'location';
    }

    // 6. Default Text
    return 'text';
}
