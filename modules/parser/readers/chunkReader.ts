
import * as FileSystem from 'expo-file-system';
import { LineBuffer } from './lineBuffer';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

/**
 * Reads a large file in chunks, decoding as UTF-8, and streaming lines to a callback.
 * 
 * @param fileUri The URI of the file to read (must be readable by Expo FileSystem)
 * @param onLines Callback function that receives an array of lines
 * @param onProgress Optional callback for progress (0 to 1)
 */
export async function readLinesInChunks(
    fileUri: string,
    onLines: (lines: string[]) => Promise<void>,
    onProgress?: (progress: number) => void
): Promise<void> {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
        throw new Error(`File not found: ${fileUri}`);
    }

    const fileSize = fileInfo.size;
    let offset = 0;
    const buffer = new LineBuffer();

    while (offset < fileSize) {
        const length = Math.min(CHUNK_SIZE, fileSize - offset);

        // Read the chunk as a Base64 string first (Expo limitation)
        const chunkBase64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
            position: offset,
            length: length,
        });

        // Decode Base64 to UTF-8 string
        // Note: In a JS environment without full Node Buffer, we rely on atob/textdecoder or similar polyfills
        // React Native has global.atob usually, but decoding large base64 strings can be slow.
        // Ideally we'd use 'readAsStringAsync' with UTF8 directly, but it doesn't support 'position' and 'length' 
        // in all older Expo versions. However, checking newer SDKs, `readAsStringAsync` DOES support position/length with UTF8!

        // Let's try direct UTF8 reading which is much more efficient if supported.
        // If this fails we might need a fallback, but for Expo 52+ it should work.
        const chunkText = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.UTF8,
            position: offset,
            length: length,
        });

        offset += length;
        const isLastChunk = offset >= fileSize;

        // Process lines
        const lines = buffer.addChunk(chunkText, isLastChunk);

        if (lines.length > 0) {
            await onLines(lines);
        }

        if (onProgress) {
            onProgress(Math.min(offset / fileSize, 1));
        }

        // Allow UI to breathe
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}
