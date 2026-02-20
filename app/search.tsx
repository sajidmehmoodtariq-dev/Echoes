import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Message, searchMessages } from '../db/db';

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    background: '#ffffff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    divider: '#e9edef',
};

type SearchResult = Message & { senderName?: string, chatName: string };

export default function SearchScreen() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Debounce search execution
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (query.trim().length > 1) {
                setIsSearching(true);
                try {
                    const matched = await searchMessages(query, 100);
                    setResults(matched);
                } catch (err) {
                    console.error("Search error:", err);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setResults([]);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const formatMessageTime = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderResult = ({ item }: { item: SearchResult }) => (
        <TouchableOpacity
            style={styles.resultItem}
            activeOpacity={0.7}
            onPress={() => {
                // Navigate to the chat and pass the specific message ID to scroll to
                router.push({
                    pathname: `/chat/[id]`,
                    params: { id: item.chatId, msgId: item.id }
                });
            }}
        >
            <View style={styles.resultHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="chatbubble-outline" size={14} color={WA_COLORS.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.chatName} numberOfLines={1}>{item.chatName}</Text>
                    {item.senderName && (
                        <>
                            <Text style={styles.dotSeparator}>•</Text>
                            <Text style={styles.senderName} numberOfLines={1}>{item.senderName}</Text>
                        </>
                    )}
                </View>
                <Text style={styles.timeText}>{formatMessageTime(item.timestamp)}</Text>
            </View>
            <Text style={styles.messageContent} numberOfLines={2}>
                {item.content}
            </Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.background} barStyle="dark-content" />

            {/* Search Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={WA_COLORS.textPrimary} />
                </TouchableOpacity>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search all chats..."
                    placeholderTextColor={WA_COLORS.textSecondary}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    returnKeyType="search"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
                        <Ionicons name="close" size={20} color={WA_COLORS.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
            <View style={styles.divider} />

            {/* Results */}
            {isSearching ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={WA_COLORS.primary} />
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderResult}
                    contentContainerStyle={styles.listContainer}
                />
            ) : query.trim().length > 1 ? (
                <View style={styles.centerContainer}>
                    <Ionicons name="search" size={48} color={WA_COLORS.divider} />
                    <Text style={styles.noResultsTitle}>No results found</Text>
                    <Text style={styles.noResultsText}>No messages match '{query}'</Text>
                </View>
            ) : (
                <View style={styles.centerContainer}>
                    <Ionicons name="search" size={48} color={WA_COLORS.divider} />
                    <Text style={styles.noResultsTitle}>Search Messages</Text>
                    <Text style={styles.noResultsText}>Search across thousands of messages instantly.</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: WA_COLORS.background,
    },
    backButton: {
        marginRight: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: WA_COLORS.textPrimary,
        padding: 0,
    },
    clearButton: {
        padding: 4,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: WA_COLORS.divider,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    noResultsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    noResultsText: {
        fontSize: 15,
        color: WA_COLORS.textSecondary,
        textAlign: 'center',
    },
    listContainer: {
        paddingBottom: 24,
    },
    resultItem: {
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    chatName: {
        fontSize: 13,
        fontWeight: 'bold',
        color: WA_COLORS.textSecondary,
        maxWidth: 100,
    },
    dotSeparator: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
        marginHorizontal: 4,
    },
    senderName: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
        flex: 1,
    },
    timeText: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
    },
    messageContent: {
        fontSize: 15,
        color: WA_COLORS.textPrimary,
        lineHeight: 20,
    }
});
