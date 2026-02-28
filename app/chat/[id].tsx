import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ImageBackground,
    Modal,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MediaBubble from '../../components/MediaBubble';
import { useChatContext } from '../../context/ChatContext';
import { getMessageNeighborhood, getMessages, Message, searchMessagesInChat } from '../../db/db';

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

    // Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isCustomSpeed, setIsCustomSpeed] = useState(false);
    const [customSpeedStr, setCustomSpeedStr] = useState('10');

    // Audio State
    const [audioSound, setAudioSound] = useState<Audio.Sound | null>(null);

    const currentScrollY = useRef(0);
    const isAtBottomRef = useRef(false);

    // Dropdown menu state
    const [menuVisible, setMenuVisible] = useState(false);

    // In-chat search state
    const [searchMode, setSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UIType[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef<TextInput>(null);

    // Unload audio on unmount
    useEffect(() => {
        return () => {
            if (audioSound) {
                audioSound.unloadAsync();
            }
        };
    }, [audioSound]);

    // Sync audio with play/pause
    useEffect(() => {
        if (audioSound) {
            if (isPlaying) {
                audioSound.playAsync();
            } else {
                audioSound.pauseAsync();
            }
        }
    }, [isPlaying, audioSound]);

    const pickAudio = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['audio/*'],
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                if (audioSound) {
                    await audioSound.unloadAsync();
                }
                const { sound } = await Audio.Sound.createAsync(
                    { uri: result.assets[0].uri },
                    { shouldPlay: isPlaying, isLooping: true }
                );
                setAudioSound(sound);
            }
        } catch (err) {
            console.error("Audio pick error:", err);
            Alert.alert("Error", "Could not load the audio track.");
        }
    };

    const handleScroll = (event: any) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        currentScrollY.current = contentOffset.y;

        // Check if within 150px of bottom
        const bottomThreshold = contentSize.height - contentOffset.y - layoutMeasurement.height;
        const bottom = bottomThreshold < 150;
        setIsAtBottom(bottom);
        isAtBottomRef.current = bottom;
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isPlaying && !isLoading) {
            interval = setInterval(() => {
                if (isAtBottomRef.current || !flatListRef.current) {
                    setIsPlaying(false);
                    return;
                }
                currentScrollY.current += (playbackSpeed * 1.5);
                flatListRef.current.scrollToOffset({ offset: currentScrollY.current, animated: false });
            }, 16);
        }
        return () => clearInterval(interval);
    }, [isPlaying, playbackSpeed, isLoading]);

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

    // In-chat search logic
    const executeSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const results = await searchMessagesInChat(Number(id), q);
            setSearchResults(results as UIType[]);
        } catch (err) {
            console.error('In-chat search error:', err);
        } finally {
            setIsSearching(false);
        }
    }, [id]);

    useEffect(() => {
        if (!searchMode) return;
        const timeout = setTimeout(() => executeSearch(searchQuery), 400);
        return () => clearTimeout(timeout);
    }, [searchQuery, searchMode]);

    const jumpToMessage = (targetMsgId: number) => {
        setSearchMode(false);
        setSearchQuery('');
        setSearchResults([]);
        setHighlightedMsgId(targetMsgId);
        // Reload messages centered on the target
        fetchMessages(0, targetMsgId);
    };

    const closeSearch = () => {
        setSearchMode(false);
        setSearchQuery('');
        setSearchResults([]);
        setHighlightedMsgId(null);
    };

    const formatSearchTime = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderSearchResultItem = ({ item }: { item: UIType }) => (
        <TouchableOpacity
            style={styles.searchResultItem}
            activeOpacity={0.7}
            onPress={() => jumpToMessage(item.id)}
        >
            <View style={styles.searchResultHeader}>
                {item.senderName && (
                    <Text style={[styles.searchResultSender, { color: getStringColor(item.senderName) }]} numberOfLines={1}>
                        {item.senderName}
                    </Text>
                )}
                <Text style={styles.searchResultTime}>{formatSearchTime(item.timestamp)}</Text>
            </View>
            <Text style={styles.searchResultContent} numberOfLines={2}>
                {item.content}
            </Text>
        </TouchableOpacity>
    );

    const renderSearchOverlay = () => {
        if (!searchMode) return null;
        return (
            <View style={styles.searchOverlay}>
                {/* Search bar */}
                <View style={styles.searchBar}>
                    <TouchableOpacity onPress={closeSearch} style={styles.searchBackBtn}>
                        <Ionicons name="arrow-back" size={24} color={WA_COLORS.textPrimary} />
                    </TouchableOpacity>
                    <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder="Search in chat..."
                        placeholderTextColor={WA_COLORS.textSecondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                            <Ionicons name="close-circle" size={20} color={WA_COLORS.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Results */}
                {isSearching ? (
                    <View style={styles.searchCenterContainer}>
                        <ActivityIndicator size="large" color={WA_COLORS.primary} />
                    </View>
                ) : searchQuery.trim().length < 2 ? (
                    <View style={styles.searchCenterContainer}>
                        <Ionicons name="search" size={48} color="#e9edef" />
                        <Text style={styles.searchPlaceholderText}>Search messages in this chat</Text>
                    </View>
                ) : searchResults.length === 0 ? (
                    <View style={styles.searchCenterContainer}>
                        <Ionicons name="search" size={48} color="#e9edef" />
                        <Text style={styles.searchPlaceholderText}>No messages found</Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.searchResultsCount}>
                            <Text style={styles.searchResultsCountText}>
                                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                            </Text>
                        </View>
                        <FlatList
                            data={searchResults}
                            keyExtractor={item => item.id.toString()}
                            renderItem={renderSearchResultItem}
                            contentContainerStyle={styles.searchResultsList}
                            keyboardShouldPersistTaps="handled"
                        />
                    </>
                )}
            </View>
        );
    };

    const renderHeader = () => {
        return (
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                    <View style={styles.avatarMini}>
                        <Ionicons name="people" size={20} color="#fff" />
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.headerTitleContainer}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/gallery/${id}` as any)}
                >
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {currentChat?.name || 'Chat'}
                    </Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        Tap here for media & gallery
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconButton} onPress={() => setMenuVisible(true)}>
                    <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
                </TouchableOpacity>

                {/* Dropdown Menu */}
                <Modal visible={menuVisible} transparent animationType="fade">
                    <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
                        <View style={styles.menuDropdown}>
                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setMenuVisible(false);
                                    setSearchMode(true);
                                }}
                            >
                                <Ionicons name="search" size={20} color={WA_COLORS.textPrimary} />
                                <Text style={styles.menuItemText}>Search</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setMenuVisible(false);
                                    setIsPlaying(!isPlaying);
                                }}
                            >
                                <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={WA_COLORS.textPrimary} />
                                <Text style={styles.menuItemText}>{isPlaying ? 'Pause Playback' : 'Playback'}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setMenuVisible(false);
                                    router.push(`/gallery/${id}` as any);
                                }}
                            >
                                <Ionicons name="images" size={20} color={WA_COLORS.textPrimary} />
                                <Text style={styles.menuItemText}>Media Gallery</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.menuItem}
                                onPress={() => {
                                    setMenuVisible(false);
                                    router.push(`/highlights/${id}` as any);
                                }}
                            >
                                <Ionicons name="star" size={20} color={WA_COLORS.textPrimary} />
                                <Text style={styles.menuItemText}>Highlights</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.menuItem, { borderBottomWidth: 0 }]}
                                onPress={() => {
                                    setMenuVisible(false);
                                    router.push(`/analytics/${id}` as any);
                                }}
                            >
                                <Ionicons name="stats-chart" size={20} color={WA_COLORS.textPrimary} />
                                <Text style={styles.menuItemText}>Analytics</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Modal>
            </View>
        );
    };

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

    const formatDateHeader = (timestamp: number) => {
        const d = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (d.toDateString() === today.toDateString()) {
            return "Today";
        } else if (d.toDateString() === yesterday.toDateString()) {
            return "Yesterday";
        } else {
            return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
        }
    };

    const renderMessage = ({ item, index }: { item: UIType, index: number }) => {
        const isSystem = item.type === 'system';
        const isDeleted = item.type === 'deleted';

        // Align right if the sender is determined to be 'Me'. Otherwise align left.
        const isSentByMe = item.senderName === meSender;

        let showDateHeader = false;
        // Don't show date headers for fallback timestamp 0
        if (item.timestamp > 0) {
            if (index === 0) {
                showDateHeader = true;
            } else {
                const prevItem = messages[index - 1];
                if (prevItem && prevItem.timestamp > 0) {
                    const currentDate = new Date(item.timestamp).toDateString();
                    const prevDate = new Date(prevItem.timestamp).toDateString();
                    if (currentDate !== prevDate) {
                        showDateHeader = true;
                    }
                } else if (prevItem && prevItem.timestamp === 0) {
                    // If exactly following a fallback message, show the date for this first real message
                    showDateHeader = true;
                }
            }
        }

        const dateHeader = showDateHeader ? (
            <View style={styles.dateHeaderContainer}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(item.timestamp)}</Text>
            </View>
        ) : null;

        if (isSystem) {
            // Hide parsing artifacts that are just a sender name and colon
            if (item.content.trim().match(/^.*?:\s*$/)) {
                return null;
            }
            return (
                <View>
                    {dateHeader}
                    <View style={styles.systemBubbleContainer}>
                        <Text style={styles.systemBubbleText}>{item.content}</Text>
                    </View>
                </View>
            );
        }

        const isHighlighted = item.id === highlightedMsgId;

        return (
            <View>
                {dateHeader}
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
                        ) : item.mediaUri ? (
                            <View>
                                <MediaBubble
                                    mediaUri={item.mediaUri}
                                    type={item.type}
                                    content={item.content}
                                />
                                {/* Show caption text if content has more than just the filename */}
                                {item.content && !item.content.match(/^.+?\.\w+\s*\(file attached\)\s*$/i) && !item.content.match(/<attached:\s*.+?\.\w+>/i) && item.type !== 'audio' && (
                                    <Text style={styles.messageText}>{item.content}</Text>
                                )}
                            </View>
                        ) : item.isMediaOmitted ? (
                            <View style={styles.mediaOmittedContainer}>
                                <Ionicons name="image-outline" size={18} color={WA_COLORS.textSecondary} style={{ marginRight: 6 }} />
                                <Text style={styles.mediaOmittedText}>{item.content || '<media omitted>'}</Text>
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
                        onScrollBeginDrag={() => setIsPlaying(false)}
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
                        onScrollToIndexFailed={info => {
                            const wait = new Promise(resolve => setTimeout(resolve, 500));
                            wait.then(() => {
                                flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                            });
                        }}
                        ListFooterComponent={isLoading && page > 0 ? <ActivityIndicator color={WA_COLORS.primary} /> : null}
                    />
                )}
            </ImageBackground>

            {renderSearchOverlay()}

            {messages.length > 0 && !isPlaying && !searchMode && (
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

            {/* Playback Controls */}
            {isPlaying && (
                <View style={[styles.playbackControls, isCustomSpeed && { paddingHorizontal: 12 }]}>
                    <TouchableOpacity style={styles.playbackBtn} onPress={() => setIsPlaying(false)}>
                        <Ionicons name="pause" size={24} color={WA_COLORS.primary} />
                    </TouchableOpacity>

                    {/* Audio track selector */}
                    <TouchableOpacity style={styles.playbackBtn} onPress={pickAudio}>
                        <Ionicons name="musical-notes" size={24} color={audioSound ? "#d81b60" : WA_COLORS.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.playbackSpeedBtn}
                        onPress={() => {
                            if (isCustomSpeed) {
                                setIsCustomSpeed(false);
                                setPlaybackSpeed(1);
                            } else if (playbackSpeed === 1) setPlaybackSpeed(2);
                            else if (playbackSpeed === 2) setPlaybackSpeed(5);
                            else if (playbackSpeed === 5) setPlaybackSpeed(10);
                            else if (playbackSpeed === 10) {
                                setIsCustomSpeed(true);
                                setPlaybackSpeed(Number(customSpeedStr) || 10);
                            } else {
                                setPlaybackSpeed(1);
                            }
                        }}
                    >
                        <Text style={styles.playbackSpeedText}>
                            {isCustomSpeed ? 'Custom' : `${playbackSpeed}x`}
                        </Text>
                    </TouchableOpacity>

                    {isCustomSpeed && (
                        <TextInput
                            style={styles.customSpeedInput}
                            keyboardType="numeric"
                            value={customSpeedStr}
                            onChangeText={t => {
                                setCustomSpeedStr(t);
                                setPlaybackSpeed(Number(t) || 10);
                            }}
                            placeholder="15"
                            placeholderTextColor={WA_COLORS.textSecondary}
                        />
                    )}
                </View>
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
    iconButton: {
        padding: 10,
        marginLeft: 4,
    },
    // Dropdown menu
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    menuDropdown: {
        position: 'absolute',
        top: 50,
        right: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        minWidth: 200,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        paddingVertical: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e9edef',
    },
    menuItemText: {
        fontSize: 15,
        color: '#111b21',
        marginLeft: 14,
        fontWeight: '400',
    },
    // In-chat search bar
    searchBar: {
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        elevation: 4,
        zIndex: 10,
    },
    searchBackBtn: {
        padding: 6,
        marginRight: 4,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#111b21',
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    searchClearBtn: {
        padding: 6,
    },
    // Search overlay (covers the chat area)
    searchOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
        zIndex: 50,
    },
    searchCenterContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    searchPlaceholderText: {
        fontSize: 15,
        color: '#667781',
        marginTop: 12,
        textAlign: 'center',
    },
    searchResultsCount: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#f0f2f5',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e9edef',
    },
    searchResultsCountText: {
        fontSize: 13,
        color: '#667781',
        fontWeight: '500',
    },
    searchResultsList: {
        paddingBottom: 20,
    },
    searchResultItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e9edef',
    },
    searchResultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    searchResultSender: {
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    searchResultTime: {
        fontSize: 12,
        color: '#667781',
        marginLeft: 8,
    },
    searchResultContent: {
        fontSize: 14,
        color: '#111b21',
        lineHeight: 20,
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
    dateHeaderContainer: {
        alignSelf: 'center',
        backgroundColor: 'rgba(226, 236, 246, 0.9)',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginVertical: 12,
    },
    dateHeaderText: {
        color: WA_COLORS.textSecondary,
        fontSize: 12,
        fontWeight: '500',
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
    mediaOmittedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f2f5',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    mediaOmittedText: {
        fontSize: 14,
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
    playbackControls: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 30,
        paddingHorizontal: 20,
        paddingVertical: 10,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.27,
        shadowRadius: 4.65,
        shadowOffset: { width: 0, height: 3 },
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    playbackBtn: {
        marginRight: 16,
    },
    playbackSpeedBtn: {
        backgroundColor: WA_COLORS.chatBackground,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
    },
    playbackSpeedText: {
        color: WA_COLORS.primaryDark,
        fontWeight: 'bold',
        fontSize: 14,
    },
    customSpeedInput: {
        backgroundColor: WA_COLORS.chatBackground,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        marginLeft: 8,
        width: 50,
        textAlign: 'center',
        color: WA_COLORS.primaryDark,
        fontWeight: 'bold',
        fontSize: 14,
    }
});
