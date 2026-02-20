import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { useRouter } from 'expo-router';
import JSZip from 'jszip';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    InteractionManager,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../context/ChatContext';
import { insertParsedChat } from '../db/db';
import { parseWhatsAppChat } from '../modules/parser';

// WhatsApp Brand Colors (Modern Android)
const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    background: '#ffffff',
    textHeader: '#ffffff',
    textSecondary: '#8696a0',
    textPrimary: '#111b21',
    divider: '#e9edef',
    fab: '#00a884',
    fabIcon: '#ffffff'
};

export default function Index() {
    const [isParsing, setIsParsing] = useState(false);

    // Global State
    const { chats, refreshChats, isLoading, setActiveChatId, removeChat } = useChatContext();
    const router = useRouter();

    const handleImport = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['text/plain', 'application/zip', 'application/x-zip-compressed', '*/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled) return;

            const file = result.assets[0];

            if (!file.name.endsWith('.txt') && !file.name.endsWith('.zip')) {
                Alert.alert("Invalid File", "Please select a valid WhatsApp exported .txt or .zip file.");
                return;
            }

            // Immediately set UI to parsing BEFORE heavy thread locking starts
            setIsParsing(true);

            // Using InteractionManager ensures React Native animations (like the picker closing)
            // finish smoothly before we execute heavy synchronous blocking CPU operations.
            InteractionManager.runAfterInteractions(async () => {
                try {
                    // 1. Read
                    let fileContent = '';
                    let chatFileName = file.name;

                    if (file.name.endsWith('.zip')) {
                        // Read ZIP as ArrayBuffer via fetch
                        const response = await fetch(file.uri);
                        const arrayBuffer = await response.arrayBuffer();
                        const zip = await JSZip.loadAsync(arrayBuffer);
                        const txtFiles = Object.keys(zip.files).filter(name => name.endsWith('.txt') && !name.startsWith('__MACOSX'));

                        if (txtFiles.length === 0) {
                            throw new Error("No .txt chat export found inside the selected zip file.");
                        }

                        chatFileName = txtFiles[0]; // Usually "_chat.txt" or "WhatsApp Chat..."
                        fileContent = await zip.files[chatFileName].async('string');
                    } else {
                        // Standard text reading
                        const response = await fetch(file.uri);
                        fileContent = await response.text();
                    }

                    // Clean the display name
                    let cleanName = file.name;
                    cleanName = cleanName
                        .replace(/^WhatsApp Chat - /i, '')
                        .replace(/^WhatsApp Chat with /i, '')
                        .replace(/\.txt$|\.zip$/i, '')
                        .trim();

                    // 2. Parse Memory
                    // For truly massive files (100MB+), this will block JS thread. 
                    // To do better involves worklets/native modules, but interaction manager helps ease the transition.
                    const timestampA = Date.now();
                    const parsedData = parseWhatsAppChat(fileContent, cleanName);

                    // Validate output
                    if (parsedData.messages.length === 0) {
                        setIsParsing(false);
                        Alert.alert("Parsing Failed", "No messages found. It might not be a valid export.");
                        return;
                    }

                    // 3. SQLite DML
                    const insertedId = await insertParsedChat(parsedData);
                    const timestampB = Date.now();

                    // Cleanup Memory immediately referencing JS engine
                    fileContent.length; // Force evaluation

                    // Allow UI to update
                    await refreshChats();
                    setIsParsing(false);

                    Alert.alert(
                        "Import Successful",
                        `Saved ${parsedData.messages.length} messages in ${timestampB - timestampA}ms.\nPlatform: ${parsedData.chat.sourcePlatform}`
                    );

                } catch (parseOrDbError: any) {
                    setIsParsing(false);
                    Alert.alert("Processing Error", parseOrDbError.message || "Failed to process chat.");
                }
            });

        } catch (err: any) {
            setIsParsing(false);
            Alert.alert("File Selection Failed", err.message || "Could not read the selected file.");
        }
    };

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <View style={styles.topHeader}>
                <Text style={styles.appName}>WhatsApp Archive</Text>
                <View style={styles.headerIcons}>
                    <TouchableOpacity style={styles.iconButton}>
                        <Ionicons name="camera-outline" size={24} color={WA_COLORS.textHeader} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/search' as any)}>
                        <Ionicons name="search" size={24} color={WA_COLORS.textHeader} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings' as any)}>
                        <Ionicons name="ellipsis-vertical" size={24} color={WA_COLORS.textHeader} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={[styles.tab, styles.activeTab]}
                >
                    <Text style={[styles.tabText, styles.activeTabText]}>
                        CHATS
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <MaterialIcons name="chat" size={80} color={WA_COLORS.divider} />
            <Text style={styles.emptyTitle}>No chats imported</Text>
            <Text style={styles.emptySubtitle}>
                Tap the button below to import a WhatsApp .txt or .zip export and bring your memories to life.
            </Text>
        </View>
    );

    const renderChatItem = ({ item }: { item: any }) => {
        // WhatsApp style short date formatting
        const dateObj = new Date(item.importDate);
        const now = new Date();
        const isToday = dateObj.toDateString() === now.toDateString();
        const dateStr = isToday
            ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : dateObj.toLocaleDateString();

        return (
            <TouchableOpacity
                style={styles.chatListItem}
                activeOpacity={0.7}
                onPress={() => {
                    setActiveChatId(item.id);
                    router.push(`/chat/${item.id}` as any);
                }}
            >
                <View style={styles.chatAvatar}>
                    <Ionicons name="people" size={28} color="#fff" />
                </View>
                <View style={styles.chatInfo}>
                    <View style={styles.chatHeaderRow}>
                        <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.chatMeta}>{dateStr}</Text>
                    </View>
                    <View style={styles.chatPreviewRow}>
                        <Text style={styles.chatPreview} numberOfLines={1}>
                            <Ionicons name="document-text-outline" size={14} color={WA_COLORS.textSecondary} /> WhatsApp Chat Export
                        </Text>
                        <TouchableOpacity
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            onPress={() => {
                                Alert.alert(
                                    "Delete Chat",
                                    "Are you sure you want to permanently delete this downloaded chat?",
                                    [
                                        { text: "Cancel", style: "cancel" },
                                        { text: "Delete", style: "destructive", onPress: () => removeChat(item.id) }
                                    ]
                                );
                            }}
                        >
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primaryDark} barStyle="light-content" />

            {renderHeader()}

            <View style={styles.content}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={WA_COLORS.primary} />
                    </View>
                ) : chats.length === 0 ? renderEmptyState() : (
                    <FlatList
                        data={chats}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderChatItem}
                        contentContainerStyle={styles.listContainer}
                    />
                )}
            </View>

            {isParsing && (
                <View style={styles.parsingOverlay}>
                    <ActivityIndicator size="large" color={WA_COLORS.primary} />
                    <Text style={styles.parsingText}>Reading and processing thousands of messages...</Text>
                </View>
            )}

            <TouchableOpacity
                style={styles.fab}
                onPress={handleImport}
                disabled={isParsing || isLoading}
                activeOpacity={0.8}
            >
                <MaterialIcons
                    name={isParsing ? "hourglass-empty" : "post-add"}
                    size={26}
                    color={WA_COLORS.fabIcon}
                />
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    headerContainer: {
        backgroundColor: WA_COLORS.primary,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        zIndex: 10,
    },
    topHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
    },
    appName: {
        fontSize: 20,
        fontWeight: '500',
        color: WA_COLORS.textHeader,
    },
    headerIcons: {
        flexDirection: 'row',
    },
    iconButton: {
        marginLeft: 20,
    },
    tabsContainer: {
        flexDirection: 'row',
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: 'center',
    },
    activeTab: {
        borderBottomWidth: 3,
        borderBottomColor: WA_COLORS.textHeader,
    },
    tabText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: 'bold',
    },
    activeTabText: {
        color: '#ffffff',
    },
    content: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginTop: 20,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 15,
        color: WA_COLORS.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    listContainer: {
        paddingVertical: 8,
    },
    chatListItem: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
    },
    chatAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#cbd5e1',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    chatInfo: {
        flex: 1,
        justifyContent: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
        paddingBottom: 12,
    },
    chatHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    chatName: {
        flex: 1,
        fontSize: 16,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginRight: 8,
    },
    chatMeta: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
    },
    chatPreview: {
        flex: 1,
        fontSize: 14,
        color: WA_COLORS.textSecondary,
    },
    chatPreviewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    parsingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    parsingText: {
        marginTop: 16,
        color: WA_COLORS.textPrimary,
        fontSize: 14,
        fontWeight: '500',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: WA_COLORS.fab,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        zIndex: 101,
    }
});
