import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import { unzip, zip } from 'react-native-zip-archive';
import { ChatExport, getChatMediaDir, getFullChatExport, importRestoredChat } from '../../db/db';
import { deleteFile, downloadFile, DriveFile, ensureBackupFolder, listBackups, uploadFile } from './drive';

export interface BackupProgress {
    stage: 'exporting' | 'zipping' | 'uploading' | 'done' | 'error';
    chatName: string;
    progress: number; // 0 to 1
    message: string;
}

export interface RestoreProgress {
    stage: 'downloading' | 'extracting' | 'importing' | 'done' | 'error';
    fileName: string;
    progress: number;
    message: string;
}

// ==========================================
// BACKUP (Local → Drive)
// ==========================================

/**
 * Exports a single chat to a zip file in the cache directory.
 * The zip contains:
 *   - chat_data.json (messages, senders, metadata)
 *   - media/ (all media files for this chat, if any)
 *
 * @param chatId The database chat ID
 * @returns Path to the created zip file, and the chat name
 */
export async function exportChatToZip(
    chatId: number,
): Promise<{ zipPath: string; chatName: string }> {
    // 1. Export chat data from DB
    const exportData = await getFullChatExport(chatId);
    if (!exportData) {
        throw new Error(`Chat ${chatId} not found`);
    }

    // 2. Create a temp directory for this backup
    const timestamp = Date.now();
    const safeName = exportData.chat.name.replace(/[^a-zA-Z0-9]/g, '_');
    const tempDirPath = `${Paths.cache.uri}/backup_${safeName}_${timestamp}`;
    const tempDir = new Directory(tempDirPath);
    if (!tempDir.exists) {
        tempDir.create();
    }

    // 3. Write chat_data.json
    const jsonFile = new ExpoFile(tempDir, 'chat_data.json');
    jsonFile.write(JSON.stringify(exportData, null, 2));

    // 4. Copy media files if they exist
    const mediaDir = await getChatMediaDir(chatId);
    if (mediaDir) {
        const sourceMediaDir = new Directory(mediaDir);
        if (sourceMediaDir.exists) {
            const destMediaDir = new Directory(tempDir, 'media');
            if (!destMediaDir.exists) {
                destMediaDir.create();
            }

            // Copy each media file to the backup folder
            const entries = sourceMediaDir.list();
            for (const entry of entries) {
                if (entry instanceof ExpoFile) {
                    try {
                        const destFile = new ExpoFile(destMediaDir, entry.name);
                        entry.copy(destFile);
                    } catch (err) {
                        console.warn(`[Backup] Failed to copy ${entry.name}:`, err);
                    }
                }
            }
        }
    }

    // 5. Zip the temp directory
    const dateStr = new Date().toISOString().split('T')[0]; // 2026-03-01
    const zipFileName = `${safeName}_${dateStr}.zip`;
    const zipPath = `${Paths.cache.uri}/${zipFileName}`;

    await zip(tempDirPath, zipPath);

    // 6. Clean up temp directory
    try {
        tempDir.delete();
    } catch {
        // Non-critical
    }

    return { zipPath, chatName: exportData.chat.name };
}

/**
 * Backs up a single chat to Google Drive.
 *
 * @param chatId The DB chat ID
 * @param onProgress Progress callback
 * @returns The Drive file metadata
 */
export async function backupChatToDrive(
    chatId: number,
    onProgress?: (p: BackupProgress) => void,
): Promise<DriveFile> {
    let chatName = 'Chat';

    try {
        // Stage 1: Export to zip
        onProgress?.({
            stage: 'exporting',
            chatName,
            progress: 0,
            message: 'Exporting chat data...',
        });

        const { zipPath, chatName: name } = await exportChatToZip(chatId);
        chatName = name;

        onProgress?.({
            stage: 'zipping',
            chatName,
            progress: 0.3,
            message: 'Preparing backup file...',
        });

        // Stage 2: Upload to Drive
        const folderId = await ensureBackupFolder();
        const fileName = zipPath.split('/').pop() || `backup_${Date.now()}.zip`;

        onProgress?.({
            stage: 'uploading',
            chatName,
            progress: 0.4,
            message: 'Uploading to Google Drive...',
        });

        const driveFile = await uploadFile(
            zipPath,
            fileName,
            folderId,
            (uploadProgress) => {
                onProgress?.({
                    stage: 'uploading',
                    chatName,
                    progress: 0.4 + uploadProgress * 0.6,
                    message: `Uploading... ${Math.round(uploadProgress * 100)}%`,
                });
            },
        );

        // Clean up local zip
        try {
            const zipFile = new ExpoFile(zipPath);
            zipFile.delete();
        } catch {
            // Non-critical
        }

        onProgress?.({
            stage: 'done',
            chatName,
            progress: 1,
            message: 'Backup complete!',
        });

        return driveFile;
    } catch (error: any) {
        onProgress?.({
            stage: 'error',
            chatName,
            progress: 0,
            message: error.message || 'Backup failed',
        });
        throw error;
    }
}

/**
 * Backs up multiple chats to Google Drive sequentially.
 */
export async function backupMultipleChatsToDrive(
    chatIds: number[],
    onProgress?: (chatIndex: number, total: number, p: BackupProgress) => void,
): Promise<DriveFile[]> {
    const results: DriveFile[] = [];
    const total = chatIds.length;

    for (let i = 0; i < chatIds.length; i++) {
        const driveFile = await backupChatToDrive(chatIds[i], (p) => {
            onProgress?.(i, total, p);
        });
        results.push(driveFile);
    }

    return results;
}

// ==========================================
// RESTORE (Drive → Local)
// ==========================================

/**
 * Restores a chat from a Google Drive backup file.
 *
 * @param driveFileId The Drive file ID
 * @param driveFileName The Drive file name (for display)
 * @param onProgress Progress callback
 * @returns The new local chat ID
 */
export async function restoreChatFromDrive(
    driveFileId: string,
    driveFileName: string,
    onProgress?: (p: RestoreProgress) => void,
): Promise<number> {
    const timestamp = Date.now();

    try {
        // Stage 1: Download
        onProgress?.({
            stage: 'downloading',
            fileName: driveFileName,
            progress: 0,
            message: 'Downloading from Google Drive...',
        });

        const downloadPath = `${Paths.cache.uri}/restore_${timestamp}.zip`;
        await downloadFile(driveFileId, downloadPath, (dlProgress) => {
            onProgress?.({
                stage: 'downloading',
                fileName: driveFileName,
                progress: dlProgress * 0.3,
                message: `Downloading... ${Math.round(dlProgress * 100)}%`,
            });
        });

        // Stage 2: Extract
        onProgress?.({
            stage: 'extracting',
            fileName: driveFileName,
            progress: 0.3,
            message: 'Extracting backup...',
        });

        const extractDir = `${Paths.cache.uri}/restore_${timestamp}`;
        await unzip(downloadPath, extractDir);

        // Stage 3: Read chat_data.json
        onProgress?.({
            stage: 'importing',
            fileName: driveFileName,
            progress: 0.5,
            message: 'Importing chat data...',
        });

        const jsonFile = new ExpoFile(extractDir + '/chat_data.json');
        if (!jsonFile.exists) {
            throw new Error('Invalid backup: chat_data.json not found');
        }
        const jsonContent = await jsonFile.text();
        const exportData: ChatExport = JSON.parse(jsonContent);

        // Validate version
        if (!exportData.version || !exportData.chat || !exportData.messages) {
            throw new Error('Invalid backup format');
        }

        // Stage 4: Move media files to permanent storage
        let mediaDir: string | null = null;
        const restoreMediaDir = new Directory(extractDir + '/media');
        if (restoreMediaDir.exists) {
            const importId = `import_${timestamp}`;
            const permanentMediaBase = new Directory(Paths.document, 'media');
            if (!permanentMediaBase.exists) {
                permanentMediaBase.create();
            }
            const permanentMediaDir = new Directory(permanentMediaBase, importId);
            if (!permanentMediaDir.exists) {
                permanentMediaDir.create();
            }

            // Move each file
            const mediaEntries = restoreMediaDir.list();
            for (const entry of mediaEntries) {
                if (entry instanceof ExpoFile) {
                    try {
                        const dest = new ExpoFile(permanentMediaDir, entry.name);
                        entry.move(dest);
                    } catch (err) {
                        console.warn(`[Restore] Failed to move media ${entry.name}:`, err);
                    }
                }
            }

            mediaDir = permanentMediaDir.uri;
        }

        // Stage 5: Insert into database
        onProgress?.({
            stage: 'importing',
            fileName: driveFileName,
            progress: 0.7,
            message: 'Saving to database...',
        });

        const chatId = await importRestoredChat(exportData, mediaDir);

        // Stage 6: Cleanup temp files
        try {
            new ExpoFile(downloadPath).delete();
        } catch { /* non-critical */ }
        try {
            new Directory(extractDir).delete();
        } catch { /* non-critical */ }

        onProgress?.({
            stage: 'done',
            fileName: driveFileName,
            progress: 1,
            message: 'Restore complete!',
        });

        return chatId;
    } catch (error: any) {
        onProgress?.({
            stage: 'error',
            fileName: driveFileName,
            progress: 0,
            message: error.message || 'Restore failed',
        });
        throw error;
    }
}

// ==========================================
// MANAGE BACKUPS
// ==========================================

/**
 * Lists all available backups from Google Drive.
 */
export { listBackups } from './drive';

/**
 * Deletes a backup from Google Drive.
 */
export async function deleteBackup(driveFileId: string): Promise<void> {
    await deleteFile(driveFileId);
}

/**
 * Formats a backup file size for display.
 */
export function formatFileSize(bytes: number | string): string {
    const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(b) || b === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
