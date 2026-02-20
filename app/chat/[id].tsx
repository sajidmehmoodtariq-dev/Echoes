import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    ImageBackground,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../../context/ChatContext';
import { getMessageNeighborhood, getMessages, Message } from '../../db/db';

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    chatBackground: '#efeae2',
    bubbleSent: '#e7ffdb',
    bubbleReceived: '#ffffff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    systemBubble: '#f2f2f2',
};

// Types
type UIType = Message & { senderName?: string };

export default function ChatScreen() {
    const { id, msgId } = useLocalSearchParams();
    const router = useRouter();
    const { chats, myName } = useChatContext();

    const [messages, setMessages] = useState<UIType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(msgId ? Number(msgId) : null);

    const PAGE_SIZE = 50;
    const flatListRef = useRef<FlatList>(null);
    const currentChat = chats.find(c => c.id === Number(id));

    const [isAtBottom, setIsAtBottom] = useState(false);

    const handleScroll = (event: any) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        // Check if within 150px of bottom
        const bottomThreshold = contentSize.height - contentOffset.y - layoutMeasurement.height;
        setIsAtBottom(bottomThreshold < 150);
    };

    const fetchMessages = async (pageNum: number, targetMsgId?: number) => {
        if (!id || (!hasMore && pageNum > 0 && !targetMsgId)) return;

        try {
            if (pageNum === 0) setIsLoading(true);

            let newMessages: UIType[] = [];

            if (targetMsgId) {
                // Deep link from search: fetch the neighborhood around this message
                newMessages = await getMessageNeighborhood(Number(id), targetMsgId, PAGE_SIZE);
                // When deep linking into the middle of a chat, standard pagination gets complicated.
                // We'll disable infinite scroll upwards for this simple implementation when jumping, 
                // or just let it be a static "snapshot" view.
                setHasMore(false);
            } else {
                newMessages = await getMessages(Number(id), PAGE_SIZE, pageNum * PAGE_SIZE);
            }

            if (newMessages.length < PAGE_SIZE && !targetMsgId) {
                setHasMore(false);
            }

            setMessages(prev => pageNum === 0 ? newMessages : [...prev, ...newMessages]);
            setPage(pageNum);

            // Auto-scroll logic if we jumped to a specific message
            if (targetMsgId && pageNum === 0) {
                // Give the FlatList a moment to render the new items, then scroll
                setTimeout(() => {
                    if (flatListRef.current) {
                        const targetIndex = newMessages.findIndex(m => m.id === targetMsgId);
                        if (targetIndex !== -1) {
                            flatListRef.current.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });
                        }
                    }
                }, 300);
            }

        } catch (err) {
            console.error("Error fetching messages:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (msgId) {
            fetchMessages(0, Number(msgId));
        } else {
            fetchMessages(0);
        }
    }, [id, msgId]);

    const renderHeader = () => (
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
                <View style={styles.avatarMini}>
                    <Ionicons name="people" size={20} color="#fff" />
                </View>
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {currentChat?.name || 'Chat'}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                    Tap here for group info
                </Text>
            </View>

            <View style={styles.headerIcons}>
                <TouchableOpacity style={styles.iconButton}>
                    <Ionicons name="videocam" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton}>
                    <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton}>
                    <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
                </TouchableOpacity>
            </View>
        </View>
    );

    const formatMessageTime = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Deterministic color generator for group chat members
    const getStringColor = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        // Use a good palette of readable colors
        const colors = [
            '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
            '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047',
            '#f4511e', '#6d4c41', '#546e7a'
        ];
        return colors[Math.abs(hash) % colors.length];
    };

    const [meSender, setMeSender] = useState<string | null>(null);
    const [isGroupChat, setIsGroupChat] = useState<boolean>(true);

    useEffect(() => {
        // If the user explicitly set their name in Settings, use it.
        if (myName) {
            setMeSender(myName);
        }
        // Otherwise attempt to heuristically identify the "Me" sender for bubble alignment
        else if (messages.length > 0 && (!meSender || isGroupChat) && currentChat) {
            const uniqueSenders = Array.from(
                new Set(messages.map(m => m.senderName).filter(name => name && name !== 'System'))
            );

            if (uniqueSenders.length > 0) {
                setIsGroupChat(uniqueSenders.length > 2);

                if (uniqueSenders.includes(currentChat.name)) {
                    const other = uniqueSenders.find(s => s !== currentChat.name);
                    if (other) setMeSender(other as string);
                } else if (uniqueSenders.length === 2) {
                    setMeSender(uniqueSenders[1] as string);
                }
            }
        }
    }, [messages, currentChat, meSender, myName]);

    const renderMessage = ({ item, index }: { item: UIType, index: number }) => {
        const isSystem = item.type === 'system';
        const isDeleted = item.type === 'deleted';

        // Align right if the sender is determined to be 'Me'. Otherwise align left.
        const isSentByMe = item.senderName === meSender;

        if (isSystem) {
            // Hide parsing artifacts that are just a sender name and colon
            if (item.content.trim().match(/^.*?:\s*$/)) {
                return null;
            }
            return (
                <View style={styles.systemBubbleContainer}>
                    <Text style={styles.systemBubbleText}>{item.content}</Text>
                </View>
            );
        }

        const isHighlighted = item.id === highlightedMsgId;

        return (
            <View style={[
                styles.messageRow,
                isSentByMe ? styles.messageRowSent : styles.messageRowReceived,
                isHighlighted && styles.highlightedRow
            ]}>
                <View style={[styles.bubble, isSentByMe ? styles.bubbleSent : styles.bubbleReceived]}>

                    {!isSentByMe && item.senderName && (
                        <Text style={[styles.senderName, { color: getStringColor(item.senderName) }]}>
                            {item.senderName}
                        </Text>
                    )}

                    {isDeleted ? (
                        <View style={styles.deletedContainer}>
                            <MaterialCommunityIcons name="cancel" size={16} color={WA_COLORS.textSecondary} style={{ marginRight: 4 }} />
                            <Text style={styles.deletedText}>This message was deleted</Text>
                        </View>
                    ) : (
                        <Text style={styles.messageText}>{item.content}</Text>
                    )}

                    <View style={styles.metaContainer}>
                        <Text style={styles.timeText}>{formatMessageTime(item.timestamp)}</Text>
                        {isSentByMe && (
                            <Ionicons name="checkmark-done" size={16} color="#53bdeb" style={{ marginLeft: 4 }} />
                        )}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primaryDark} barStyle="light-content" />
            {renderHeader()}

            {/* WhatsApp standard beige doodle background */}
            <ImageBackground
                source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
                style={styles.chatBackground}
                imageStyle={{ opacity: 0.1 }}
            >
                {isLoading && page === 0 ? (
                    <ActivityIndicator size="large" color={WA_COLORS.primary} style={styles.loader} />
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.listContainer}
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                        // For a chat, you usually want to start at the bottom, or inverted. 
                        // We'll load top down for now (oldest first).
                        // To implement true chat feel (newest bottom), we need an Inverted FlatList.
                        // But WhatsApp exports are oldest-first.
                        onEndReached={() => {
                            if (!isLoading && hasMore) {
                                fetchMessages(page + 1);
                            }
                        }}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={isLoading && page > 0 ? <ActivityIndicator color={WA_COLORS.primary} /> : null}
                    />
                )}
            </ImageBackground>

            {messages.length > 0 && (
                <TouchableOpacity
                    style={styles.scrollFab}
                    activeOpacity={0.8}
                    onPress={() => {
                        if (isAtBottom) {
                            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                        } else {
                            flatListRef.current?.scrollToEnd({ animated: true });
                        }
                    }}
                >
                    <MaterialCommunityIcons
                        name={isAtBottom ? "chevron-double-up" : "chevron-double-down"}
                        size={24}
                        color={WA_COLORS.primary}
                    />
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: WA_COLORS.primaryDark,
    },
    header: {
        backgroundColor: WA_COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 5,
        elevation: 4,
        zIndex: 10,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
    },
    avatarMini: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#cbd5e1',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 10,
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    headerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
    },
    headerIcons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        padding: 10,
        marginLeft: 4,
    },
    chatBackground: {
        flex: 1,
        backgroundColor: WA_COLORS.chatBackground,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
    },
    listContainer: {
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    systemBubbleContainer: {
        alignSelf: 'center',
        backgroundColor: 'rgba(226, 236, 246, 0.9)',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginVertical: 12,
        maxWidth: '85%',
    },
    systemBubbleText: {
        color: WA_COLORS.textSecondary,
        fontSize: 12,
        textAlign: 'center',
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    messageRowSent: {
        justifyContent: 'flex-end',
    },
    messageRowReceived: {
        justifyContent: 'flex-start',
    },
    highlightedRow: {
        backgroundColor: 'rgba(255, 235, 59, 0.4)',
        borderRadius: 8,
        marginHorizontal: 4,
    },
    bubble: {
        maxWidth: '80%',
        padding: 8,
        paddingBottom: 6,
        borderRadius: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 1,
        shadowOffset: { width: 0, height: 1 },
    },
    bubbleSent: {
        backgroundColor: WA_COLORS.bubbleSent,
        borderTopRightRadius: 0,
    },
    bubbleReceived: {
        backgroundColor: WA_COLORS.bubbleReceived,
        borderTopLeftRadius: 0,
    },
    senderName: {
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    messageText: {
        fontSize: 15,
        color: WA_COLORS.textPrimary,
        lineHeight: 20,
    },
    deletedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deletedText: {
        fontSize: 15,
        color: WA_COLORS.textSecondary,
        fontStyle: 'italic',
    },
    metaContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 2,
    },
    timeText: {
        fontSize: 11,
        color: WA_COLORS.textSecondary,
    },
    scrollFab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.27,
        shadowRadius: 4.65,
        zIndex: 20,
    },
});
