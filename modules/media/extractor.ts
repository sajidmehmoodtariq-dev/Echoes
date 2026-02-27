import { Directory, File, Paths } from 'expo-file-system';

/**
 * Directory where extracted media is stored on device.
 * Each chat import gets its own subdirectory keyed by a unique ID.
 */
function getMediaBaseDir(): Directory {
    return new Directory(Paths.document, 'media');
}

/**
 * Known media file extensions from WhatsApp exports.
 */
const MEDIA_EXTENSIONS = new Set([
    // Images
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    // Video
    '.mp4', '.mov', '.3gp', '.avi',
    // Audio / Voice notes
    '.opus', '.mp3', '.m4a', '.wav', '.ogg', '.aac',
    // Stickers
    // .webp already covered above
    // Documents (we save these too)
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
    // Contacts
    '.vcf',
]);

/**
 * Checks if a filename is a media/attachment file based on its extension.
 */
function isMediaFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    // Skip macOS metadata
    if (lower.includes('__macosx')) return false;
    // Skip the chat text file itself
    if (lower.endsWith('.txt') && (lower.includes('chat') || lower.includes('_chat'))) return false;

    for (const ext of MEDIA_EXTENSIONS) {
        if (lower.endsWith(ext)) return true;
    }
    return false;
}

/**
 * Scans an already-extracted directory for media files and moves them to
 * permanent storage under the app's document directory.
 *
 * This is designed to work AFTER `react-native-zip-archive` has natively
 * extracted the zip to a temp folder on disk (no JS memory needed).
 *
 * @param extractedDir The directory where the zip was extracted to
 * @param chatImportId A unique string to namespace this import's media
 * @returns Map<string, string> mapping original filenames (lowercase) to local file URIs
 */
export function extractMediaFromDirectory(
    extractedDir: Directory,
    chatImportId: string,
): Map<string, string> {
    const mediaMap = new Map<string, string>();

    // Ensure permanent media directory exists
    const baseDir = getMediaBaseDir();
    if (!baseDir.exists) {
        baseDir.create();
    }
    const chatMediaDir = new Directory(baseDir, chatImportId);
    if (!chatMediaDir.exists) {
        chatMediaDir.create();
    }

    // Recursively scan the extracted directory for media files
    const scanDir = (dir: Directory) => {
        const entries = dir.list();
        for (const entry of entries) {
            if (entry instanceof Directory) {
                // Skip macOS metadata folders
                if (!entry.uri.includes('__MACOSX')) {
                    scanDir(entry);
                }
            } else if (entry instanceof File) {
                const fileName = entry.name;
                if (isMediaFile(fileName)) {
                    try {
                        // Move file to permanent storage (faster than copy, no extra memory)
                        const destFile = new File(chatMediaDir, fileName);
                        entry.move(destFile);
                        mediaMap.set(fileName.toLowerCase(), destFile.uri);
                    } catch (err) {
                        console.warn(`[MediaExtractor] Failed to move ${fileName}:`, err);
                    }
                }
            }
        }
    };

    scanDir(extractedDir);

    console.log(`[MediaExtractor] Found and moved ${mediaMap.size} media files to permanent storage.`);
    return mediaMap;
}

/**
 * Finds the .txt chat export file inside an extracted directory.
 * Returns the File object or null if not found.
 */
export function findChatTxtFile(extractedDir: Directory): File | null {
    const entries = extractedDir.list();
    for (const entry of entries) {
        if (entry instanceof File && entry.name.toLowerCase().endsWith('.txt')) {
            // Prefer files with "chat" in the name, but accept any .txt
            return entry;
        }
        if (entry instanceof Directory && !entry.uri.includes('__MACOSX')) {
            const found = findChatTxtFile(entry);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Extracts the attachment filename from a WhatsApp message body.
 * Handles both Android and iOS formats:
 *   Android: "IMG-20231025-WA0001.jpg (file attached)"
 *   iOS:     "<attached: 00000001-PHOTO-2023-10-25-12-30-45.jpg>"
 *
 * @param content The message content string
 * @returns The filename if found, or null
 */
export function extractAttachmentFilename(content: string): string | null {
    if (!content) return null;

    // Android format: "FILENAME.ext (file attached)"
    const androidMatch = content.match(/^(.+?\.\w+)\s*\(file attached\)\s*$/i);
    if (androidMatch) {
        return androidMatch[1].trim();
    }

    // iOS format: "<attached: FILENAME.ext>"
    const iosMatch = content.match(/<attached:\s*(.+?\.\w+)>/i);
    if (iosMatch) {
        return iosMatch[1].trim();
    }

    // Some exports just have the filename on its own line
    // e.g., "IMG-20231025-WA0001.jpg"
    const plainFileMatch = content.match(/^((?:IMG|VID|AUD|PTT|DOC|STK)-\d{8}-WA\d+\.\w+)\s*$/i);
    if (plainFileMatch) {
        return plainFileMatch[1].trim();
    }

    return null;
}

/**
 * Cleans up media files for a specific chat import.
 * Call this when a chat is deleted.
 */
export async function deleteMediaForChat(chatImportId: string): Promise<void> {
    try {
        const baseDir = getMediaBaseDir();
        const chatMediaDir = new Directory(baseDir, chatImportId);
        if (chatMediaDir.exists) {
            chatMediaDir.delete();
            console.log(`[MediaExtractor] Cleaned up media for chat: ${chatImportId}`);
        }
    } catch (err) {
        console.warn(`[MediaExtractor] Error cleaning up media for ${chatImportId}:`, err);
    }
}
