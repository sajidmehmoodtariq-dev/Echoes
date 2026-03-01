import { File as ExpoFile, Paths } from 'expo-file-system';
import { getAccessToken } from './auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Echoes Backups';

export interface DriveFile {
    id: string;
    name: string;
    modifiedTime: string;
    size: string; // bytes as string
    mimeType: string;
}

/**
 * Makes an authenticated Drive API request.
 * Automatically attaches the Bearer token.
 */
async function driveRequest(
    url: string,
    options: RequestInit = {},
): Promise<Response> {
    const token = await getAccessToken();
    const headers = {
        ...((options.headers as Record<string, string>) || {}),
        Authorization: `Bearer ${token}`,
    };
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
        // Token might have expired mid-session; retry once with fresh token
        const freshToken = await getAccessToken();
        headers.Authorization = `Bearer ${freshToken}`;
        return fetch(url, { ...options, headers });
    }

    return res;
}

// ==========================================
// FOLDER MANAGEMENT
// ==========================================

/**
 * Finds or creates the "Echoes Backups" folder in the user's Drive root.
 * Returns the folder ID.
 */
export async function ensureBackupFolder(): Promise<string> {
    // Search for existing folder
    const query = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchRes = await driveRequest(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
    );
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // Create the folder
    const createRes = await driveRequest(`${DRIVE_API}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
        }),
    });
    const createData = await createRes.json();
    return createData.id;
}

// ==========================================
// LISTING FILES
// ==========================================

/**
 * Lists all backup files in the Echoes Backups folder.
 */
export async function listBackups(): Promise<DriveFile[]> {
    const folderId = await ensureBackupFolder();
    const query = `'${folderId}' in parents and trashed=false`;
    const fields = 'files(id,name,modifiedTime,size,mimeType)';

    const res = await driveRequest(
        `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${fields}&orderBy=modifiedTime desc&pageSize=100`,
    );
    const data = await res.json();
    return data.files || [];
}

// ==========================================
// UPLOAD
// ==========================================

/**
 * Uploads a local file to Google Drive using multipart upload.
 * Suitable for files up to ~5MB. For larger files, prefer resumable upload.
 *
 * @param localPath Local file URI
 * @param fileName Name for the file on Drive
 * @param folderId Parent folder ID on Drive
 * @returns The created Drive file metadata
 */
export async function uploadFileMultipart(
    localPath: string,
    fileName: string,
    folderId: string,
): Promise<DriveFile> {
    const token = await getAccessToken();

    // Read file as base64
    const file = new ExpoFile(localPath);
    const base64 = file.base64();

    const metadata = JSON.stringify({
        name: fileName,
        parents: [folderId],
    });

    const boundary = '---EchoesUploadBoundary';
    const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/zip\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n` +
        `${base64}\r\n` +
        `--${boundary}--`;

    const res = await fetch(
        `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime,size,mimeType`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        },
    );

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload failed (${res.status}): ${errText}`);
    }

    return await res.json();
}

/**
 * Uploads a local file using resumable upload protocol.
 * Handles large files with progress reporting.
 *
 * @param localPath Local file URI
 * @param fileName Name for the file on Drive
 * @param folderId Parent folder ID on Drive
 * @param onProgress Optional progress callback (0 to 1)
 * @returns The created Drive file metadata
 */
export async function uploadFileResumable(
    localPath: string,
    fileName: string,
    folderId: string,
    onProgress?: (progress: number) => void,
): Promise<DriveFile> {
    const token = await getAccessToken();

    // Step 1: Initiate resumable session
    const initRes = await fetch(
        `${UPLOAD_API}/files?uploadType=resumable&fields=id,name,modifiedTime,size,mimeType`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify({
                name: fileName,
                parents: [folderId],
            }),
        },
    );

    if (!initRes.ok) {
        throw new Error(`Resumable upload init failed (${initRes.status})`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
        throw new Error('No upload URL returned from resumable init');
    }

    // Step 2: Read file and upload in chunks
    const file = new ExpoFile(localPath);
    const fileBytes = await file.bytes();
    const totalSize = fileBytes.length;
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

    let offset = 0;
    let lastResponse: Response | null = null;

    while (offset < totalSize) {
        const end = Math.min(offset + CHUNK_SIZE, totalSize);
        const chunk = fileBytes.slice(offset, end);

        const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Length': chunk.length.toString(),
                'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
            },
            body: chunk,
        });

        if (res.status === 200 || res.status === 201) {
            // Upload complete
            lastResponse = res;
            break;
        } else if (res.status === 308) {
            // Chunk accepted, continue
            offset = end;
            onProgress?.(offset / totalSize);
        } else {
            throw new Error(`Chunk upload failed (${res.status})`);
        }
    }

    onProgress?.(1);
    if (lastResponse) {
        return await lastResponse.json();
    }
    throw new Error('Upload completed but no response received');
}

/**
 * Smart upload: uses multipart for small files, resumable for large ones.
 */
export async function uploadFile(
    localPath: string,
    fileName: string,
    folderId: string,
    onProgress?: (progress: number) => void,
): Promise<DriveFile> {
    // Check file size
    const file = new ExpoFile(localPath);
    const size = file.size ?? 0;
    const FIVE_MB = 5 * 1024 * 1024;

    if (size <= FIVE_MB) {
        onProgress?.(0.5);
        const result = await uploadFileMultipart(localPath, fileName, folderId);
        onProgress?.(1);
        return result;
    } else {
        return uploadFileResumable(localPath, fileName, folderId, onProgress);
    }
}

// ==========================================
// DOWNLOAD
// ==========================================

/**
 * Downloads a file from Google Drive to local storage.
 *
 * @param fileId The Drive file ID
 * @param destPath Local destination file path
 * @param onProgress Optional progress callback (0 to 1)
 */
export async function downloadFile(
    fileId: string,
    destPath: string,
    onProgress?: (progress: number) => void,
): Promise<void> {
    const token = await getAccessToken();
    const url = `${DRIVE_API}/files/${fileId}?alt=media`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }

    // Get total size from content-length header
    const contentLength = res.headers.get('content-length');
    const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

    // Stream response to file
    const reader = res.body?.getReader();
    if (!reader) {
        throw new Error('No response body reader available');
    }

    const chunks: Uint8Array[] = [];
    let downloaded = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            downloaded += value.length;
            if (totalSize > 0) {
                onProgress?.(downloaded / totalSize);
            }
        }
    }

    // Combine chunks and write to file
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
        combined.set(chunk, pos);
        pos += chunk.length;
    }

    const destFile = new ExpoFile(destPath);
    destFile.write(combined);
    onProgress?.(1);
}

// ==========================================
// DELETE
// ==========================================

/**
 * Permanently deletes a file from Google Drive.
 */
export async function deleteFile(fileId: string): Promise<void> {
    const res = await driveRequest(`${DRIVE_API}/files/${fileId}`, {
        method: 'DELETE',
    });

    if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (${res.status})`);
    }
}
