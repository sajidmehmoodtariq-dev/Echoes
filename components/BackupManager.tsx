import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Chat } from '../db/db';
import { BackupProgress, backupChatToDrive } from '../modules/google/backup';

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    background: '#fff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    divider: '#e9edef',
    success: '#00a884',
    error: '#ea4335',
};

interface Props {
    chats: Chat[];
    onDone: () => void;
}

interface ChatBackupState {
    chatId: number;
    selected: boolean;
    status: 'idle' | 'in-progress' | 'done' | 'error';
    message: string;
    progress: number;
}

export default function BackupManager({ chats, onDone }: Props) {
    const [chatStates, setChatStates] = useState<ChatBackupState[]>(
        chats.map(c => ({
            chatId: c.id,
            selected: false,
            status: 'idle',
            message: '',
            progress: 0,
        })),
    );
    const [isBacking, setIsBacking] = useState(false);

    const selectedCount = chatStates.filter(s => s.selected).length;

    const toggleChat = (chatId: number) => {
        if (isBacking) return;
        setChatStates(prev =>
            prev.map(s =>
                s.chatId === chatId ? { ...s, selected: !s.selected } : s,
            ),
        );
    };

    const toggleAll = () => {
        if (isBacking) return;
        const allSelected = chatStates.every(s => s.selected);
        setChatStates(prev => prev.map(s => ({ ...s, selected: !allSelected })));
    };

    const startBackup = async () => {
        const selected = chatStates.filter(s => s.selected);
        if (selected.length === 0) {
            Alert.alert('No chats selected', 'Please select at least one chat to back up.');
            return;
        }

        setIsBacking(true);

        for (const item of selected) {
            // Update to in-progress
            setChatStates(prev =>
                prev.map(s =>
                    s.chatId === item.chatId
                        ? { ...s, status: 'in-progress', message: 'Starting...', progress: 0 }
                        : s,
                ),
            );

            try {
                await backupChatToDrive(item.chatId, (p: BackupProgress) => {
                    setChatStates(prev =>
                        prev.map(s =>
                            s.chatId === item.chatId
                                ? { ...s, progress: p.progress, message: p.message }
                                : s,
                        ),
                    );
                });

                setChatStates(prev =>
                    prev.map(s =>
                        s.chatId === item.chatId
                            ? { ...s, status: 'done', progress: 1, message: 'Backup complete!' }
                            : s,
                    ),
                );
            } catch (err: any) {
                setChatStates(prev =>
                    prev.map(s =>
                        s.chatId === item.chatId
                            ? { ...s, status: 'error', progress: 0, message: err.message || 'Failed' }
                            : s,
                    ),
                );
            }
        }

        setIsBacking(false);
    };

    const renderChatItem = ({ item }: { item: ChatBackupState }) => {
        const chat = chats.find(c => c.id === item.chatId);
        if (!chat) return null;

        return (
            <TouchableOpacity
                style={styles.chatItem}
                onPress={() => toggleChat(item.chatId)}
                disabled={isBacking}
                activeOpacity={0.7}
            >
                {/* Checkbox */}
                <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                    {item.selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>

                {/* Chat info */}
                <View style={styles.chatInfo}>
                    <Text style={styles.chatName} numberOfLines={1}>{chat.name}</Text>
                    {item.status === 'idle' && (
                        <Text style={styles.chatMeta}>
                            Imported {new Date(chat.importDate).toLocaleDateString()}
                        </Text>
                    )}
                    {item.status === 'in-progress' && (
                        <View style={styles.progressRow}>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${item.progress * 100}%` }]} />
                            </View>
                            <Text style={styles.progressText}>{item.message}</Text>
                        </View>
                    )}
                    {item.status === 'done' && (
                        <Text style={[styles.chatMeta, { color: WA_COLORS.success }]}>
                            {item.message}
                        </Text>
                    )}
                    {item.status === 'error' && (
                        <Text style={[styles.chatMeta, { color: WA_COLORS.error }]}>
                            {item.message}
                        </Text>
                    )}
                </View>

                {/* Status icon */}
                {item.status === 'in-progress' && (
                    <ActivityIndicator size="small" color={WA_COLORS.primary} />
                )}
                {item.status === 'done' && (
                    <Ionicons name="cloud-done" size={22} color={WA_COLORS.success} />
                )}
                {item.status === 'error' && (
                    <Ionicons name="alert-circle" size={22} color={WA_COLORS.error} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Back Up Chats</Text>
                <Text style={styles.subtitle}>
                    Select chats to upload to Google Drive
                </Text>
            </View>

            {/* Select all */}
            <TouchableOpacity
                style={styles.selectAllRow}
                onPress={toggleAll}
                disabled={isBacking}
            >
                <View style={[
                    styles.checkbox,
                    chatStates.every(s => s.selected) && styles.checkboxSelected,
                ]}>
                    {chatStates.every(s => s.selected) && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                    )}
                </View>
                <Text style={styles.selectAllText}>Select All ({chats.length})</Text>
            </TouchableOpacity>

            {/* Chat list */}
            <FlatList
                data={chatStates}
                keyExtractor={item => item.chatId.toString()}
                renderItem={renderChatItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
            />

            {/* Action buttons */}
            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={onDone}
                    disabled={isBacking}
                >
                    <Text style={styles.cancelBtnText}>
                        {isBacking ? 'Please wait...' : 'Cancel'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.backupBtn,
                        (selectedCount === 0 || isBacking) && styles.btnDisabled,
                    ]}
                    onPress={startBackup}
                    disabled={selectedCount === 0 || isBacking}
                >
                    {isBacking ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="cloud-upload" size={18} color="#fff" style={{ marginRight: 6 }} />
                            <Text style={styles.backupBtnText}>
                                Backup {selectedCount > 0 ? `(${selectedCount})` : ''}
                            </Text>
                        </>
                    )}
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
    selectAllRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
    },
    selectAllText: {
        fontSize: 15,
        fontWeight: '600',
        color: WA_COLORS.primary,
        marginLeft: 12,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 16,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: WA_COLORS.textSecondary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: WA_COLORS.primary,
        borderColor: WA_COLORS.primary,
    },
    chatInfo: {
        flex: 1,
        marginLeft: 14,
        marginRight: 8,
    },
    chatName: {
        fontSize: 16,
        fontWeight: '500',
        color: WA_COLORS.textPrimary,
    },
    chatMeta: {
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
    actions: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: WA_COLORS.divider,
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: WA_COLORS.divider,
        alignItems: 'center',
    },
    cancelBtnText: {
        fontSize: 15,
        color: WA_COLORS.textSecondary,
        fontWeight: '500',
    },
    backupBtn: {
        flex: 2,
        flexDirection: 'row',
        paddingVertical: 12,
        borderRadius: 24,
        backgroundColor: WA_COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backupBtnText: {
        fontSize: 15,
        color: '#fff',
        fontWeight: '600',
    },
    btnDisabled: {
        opacity: 0.5,
    },
});
