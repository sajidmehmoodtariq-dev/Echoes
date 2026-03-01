import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    deleteBackup,
    formatFileSize,
    restoreChatFromDrive,
    RestoreProgress,
} from '../modules/google/backup';
import { listBackups, DriveFile } from '../modules/google/drive';

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    background: '#fff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    divider: '#e9edef',
    success: '#00a884',
    error: '#ea4335',
    warning: '#f59e0b',
};

interface Props {
    onDone: () => void;
    onChatRestored: () => void; // call refreshChats after restore
}

interface BackupItemState {
    file: DriveFile;
    status: 'idle' | 'restoring' | 'deleting' | 'done' | 'error';
    message: string;
    progress: number;
}

export default function RestoreManager({ onDone, onChatRestored }: Props) {
    const [backups, setBackups] = useState<BackupItemState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBusy, setIsBusy] = useState(false);

    useEffect(() => {
        loadBackups();
    }, []);

    const loadBackups = async () => {
        setIsLoading(true);
        try {
            const files = await listBackups();
            setBackups(
                files.map(f => ({
                    file: f,
                    status: 'idle',
                    message: '',
                    progress: 0,
                })),
            );
        } catch (err: any) {
            console.error('[RestoreManager] Failed to list backups:', err);
            Alert.alert('Error', 'Failed to load backups from Google Drive.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = async (item: BackupItemState) => {
        Alert.alert(
            'Restore Backup',
            `Restore "${item.file.name}" from Google Drive?\n\nThis will import the chat as a new entry.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    onPress: () => doRestore(item),
                },
            ],
        );
    };

    const doRestore = async (item: BackupItemState) => {
        setIsBusy(true);
        const fileId = item.file.id;

        // Update status
        setBackups(prev =>
            prev.map(b =>
                b.file.id === fileId
                    ? { ...b, status: 'restoring', message: 'Starting...', progress: 0 }
                    : b,
            ),
        );

        try {
            await restoreChatFromDrive(fileId, item.file.name, (p: RestoreProgress) => {
                setBackups(prev =>
                    prev.map(b =>
                        b.file.id === fileId
                            ? { ...b, progress: p.progress, message: p.message }
                            : b,
                    ),
                );
            });

            setBackups(prev =>
                prev.map(b =>
                    b.file.id === fileId
                        ? { ...b, status: 'done', progress: 1, message: 'Restored successfully!' }
                        : b,
                ),
            );

            onChatRestored();
        } catch (err: any) {
            setBackups(prev =>
                prev.map(b =>
                    b.file.id === fileId
                        ? { ...b, status: 'error', progress: 0, message: err.message || 'Restore failed' }
                        : b,
                ),
            );
        } finally {
            setIsBusy(false);
        }
    };

    const handleDelete = (item: BackupItemState) => {
        Alert.alert(
            'Delete Backup',
            `Permanently delete "${item.file.name}" from Google Drive?\n\nThis cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => doDelete(item),
                },
            ],
        );
    };

    const doDelete = async (item: BackupItemState) => {
        setIsBusy(true);
        const fileId = item.file.id;

        setBackups(prev =>
            prev.map(b =>
                b.file.id === fileId ? { ...b, status: 'deleting', message: 'Deleting...' } : b,
            ),
        );

        try {
            await deleteBackup(fileId);
            // Remove from list
            setBackups(prev => prev.filter(b => b.file.id !== fileId));
        } catch (err: any) {
            setBackups(prev =>
                prev.map(b =>
                    b.file.id === fileId
                        ? { ...b, status: 'error', message: err.message || 'Delete failed' }
                        : b,
                ),
            );
        } finally {
            setIsBusy(false);
        }
    };

    const formatDate = (isoDate: string) => {
        const d = new Date(isoDate);
        return d.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    /**
     * Parse the user-friendly chat name from a backup filename.
     * Format: ChatName_2026-03-01.zip
     */
    const parseChatName = (fileName: string): string => {
        const withoutExt = fileName.replace(/\.zip$/i, '');
        // Remove the date suffix (last _YYYY-MM-DD)
        const datePattern = /_\d{4}-\d{2}-\d{2}$/;
        const name = withoutExt.replace(datePattern, '');
        // Replace underscores back to spaces
        return name.replace(/_/g, ' ');
    };

    const renderBackupItem = ({ item }: { item: BackupItemState }) => {
        const chatName = parseChatName(item.file.name);

        return (
            <View style={styles.backupItem}>
                <View style={styles.backupIcon}>
                    <Ionicons
                        name={
                            item.status === 'done'
                                ? 'checkmark-circle'
                                : item.status === 'error'
                                    ? 'alert-circle'
                                    : 'document'
                        }
                        size={32}
                        color={
                            item.status === 'done'
                                ? WA_COLORS.success
                                : item.status === 'error'
                                    ? WA_COLORS.error
                                    : WA_COLORS.primary
                        }
                    />
                </View>

                <View style={styles.backupInfo}>
                    <Text style={styles.backupName} numberOfLines={1}>{chatName}</Text>
                    <Text style={styles.backupMeta}>
                        {formatDate(item.file.modifiedTime)} · {formatFileSize(item.file.size)}
                    </Text>

                    {/* Progress */}
                    {(item.status === 'restoring' || item.status === 'deleting') && (
                        <View style={styles.progressRow}>
                            <View style={styles.progressBarBg}>
                                <View
                                    style={[styles.progressBarFill, { width: `${item.progress * 100}%` }]}
                                />
                            </View>
                            <Text style={styles.progressText}>{item.message}</Text>
                        </View>
                    )}

                    {item.status === 'done' && (
                        <Text style={[styles.backupMeta, { color: WA_COLORS.success }]}>
                            {item.message}
                        </Text>
                    )}
                    {item.status === 'error' && (
                        <Text style={[styles.backupMeta, { color: WA_COLORS.error }]}>
                            {item.message}
                        </Text>
                    )}
                </View>

                {/* Action buttons */}
                {item.status === 'idle' && (
                    <View style={styles.backupActions}>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleRestore(item)}
                            disabled={isBusy}
                        >
                            <Ionicons name="download" size={20} color={WA_COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => handleDelete(item)}
                            disabled={isBusy}
                        >
                            <Ionicons name="trash-outline" size={20} color={WA_COLORS.error} />
                        </TouchableOpacity>
                    </View>
                )}

                {(item.status === 'restoring' || item.status === 'deleting') && (
                    <ActivityIndicator size="small" color={WA_COLORS.primary} />
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Google Drive Backups</Text>
                <Text style={styles.subtitle}>
                    {backups.length} backup{backups.length !== 1 ? 's' : ''} found
                </Text>
            </View>

            {/* Content */}
            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={WA_COLORS.primary} />
                    <Text style={styles.loadingText}>Loading backups from Drive...</Text>
                </View>
            ) : backups.length === 0 ? (
                <View style={styles.centerContainer}>
                    <Ionicons name="cloud-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyTitle}>No backups found</Text>
                    <Text style={styles.emptySubtitle}>
                        Back up your chats first to see them here
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={backups}
                    keyExtractor={item => item.file.id}
                    renderItem={renderBackupItem}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                />
            )}

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.refreshBtn} onPress={loadBackups} disabled={isBusy}>
                    <Ionicons name="refresh" size={18} color={WA_COLORS.primary} />
                    <Text style={styles.refreshBtnText}>Refresh</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
                    <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: WA_COLORS.textPrimary,
    },
    subtitle: {
        fontSize: 14,
        color: WA_COLORS.textSecondary,
        marginTop: 4,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    loadingText: {
        fontSize: 15,
        color: WA_COLORS.textSecondary,
        marginTop: 12,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: WA_COLORS.textSecondary,
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#aaa',
        textAlign: 'center',
        marginTop: 6,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 16,
    },
    backupItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
    },
    backupIcon: {
        marginRight: 14,
    },
    backupInfo: {
        flex: 1,
        marginRight: 8,
    },
    backupName: {
        fontSize: 16,
        fontWeight: '500',
        color: WA_COLORS.textPrimary,
    },
    backupMeta: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
        marginTop: 2,
    },
    progressRow: {
        marginTop: 4,
    },
    progressBarBg: {
        height: 3,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: WA_COLORS.primary,
        borderRadius: 2,
    },
    progressText: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
        marginTop: 2,
    },
    backupActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
    },
    bottomBar: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: WA_COLORS.divider,
        gap: 12,
    },
    refreshBtn: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: WA_COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    refreshBtnText: {
        fontSize: 15,
        color: WA_COLORS.primary,
        fontWeight: '500',
    },
    doneBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 24,
        backgroundColor: WA_COLORS.primary,
        alignItems: 'center',
    },
    doneBtnText: {
        fontSize: 15,
        color: '#fff',
        fontWeight: '600',
    },
});
