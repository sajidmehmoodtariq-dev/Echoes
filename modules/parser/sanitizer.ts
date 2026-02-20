/**
 * Cleans up raw text from WhatsApp exports.
 * Removes invisible control characters (like LRM, RLM used for RTL text formatting)
 * that can cause issues in search or UI rendering.
 */
export function sanitizeContent(content: string): string {
    if (!content) return '';

    // Remove Right-to-Left Mark (U+200F) and Left-to-Right Mark (U+200E)
    // and other common invisible formatting characters that WhatsApp might inject.
    // Also trims leading/trailing whitespace.
    return content
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .trim();
}
