export type Platform = 'ios' | 'android' | 'unknown';

export type MessageType =
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'sticker'
    | 'gif'
    | 'document'
    | 'contact'
    | 'location'
    | 'system'      // "Messages are encrypted", "You created group"
    | 'call_log'    // "Missed voice call"
    | 'deleted';    // "This message was deleted"

export interface Chat {
    id: number;
    name: string;
    sourcePlatform: Platform;
    importDate: number; // Unix ms
    metadata?: string;
    file_path?: string;
}

export interface Sender {
    id: number;
    name: string;
    displayName?: string;
    color?: string;
}

export interface Message {
    id: number;
    chatId: number;
    senderId?: number; // Null for system messages
    timestamp: number; // Unix ms
    content: string;
    type: MessageType;
    isMediaOmitted: boolean;
    mediaUri?: string;
    replyToId?: number;
    // Raw data for potential re-parsing fixes
    rawText?: string;
    sentimentScore?: number;
    isMeaningful?: boolean;
}
