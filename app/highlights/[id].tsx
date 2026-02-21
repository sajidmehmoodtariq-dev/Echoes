import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ImageBackground, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../../context/ChatContext';
import { getOnThisDay, getOnThisWeek, getRandomHighlights, Message } from '../../db/db';

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    background: '#e5ddd5',
    textPrimary: '#111b21',
    textSecondary: '#8696a0',
    cardLight: '#ffffff',
    divider: '#e9edef',
};

type HighlightMsg = Message & { senderName?: string, chatName?: string };

export default function HighlightsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { chats } = useChatContext();
    const currentChat = chats.find(c => c.id === Number(id));

    const [isLoading, setIsLoading] = useState(true);
    const [randomHighlights, setRandomHighlights] = useState<HighlightMsg[]>([]);
    const [onThisDateMatches, setOnThisDateMatches] = useState<{ type: 'day' | 'week', matches: HighlightMsg[] }>({ type: 'day', matches: [] });

    useEffect(() => {
        const loadMemories = async () => {
            if (!id) return;
            try {
                const chatId = Number(id);
                const random = await getRandomHighlights(chatId, 5); // Get 5 random ones
                let onDate = await getOnThisDay(chatId);
                let dateType: 'day' | 'week' = 'day';

                // Fallback to "On This Week" if no exact day match
                if (onDate.length === 0) {
                    onDate = await getOnThisWeek(chatId);
                    dateType = 'week';
                }

                setRandomHighlights(random);
                setOnThisDateMatches({ type: dateType, matches: onDate });
            } catch (err) {
                console.error("Error loading memories:", err);
            } finally {
                setIsLoading(false);
            }
        };
        loadMemories();
    }, [id]);

    const handleJumpToMessage = (msgId: number) => {
        router.push(`/chat/${id}?msgId=${msgId}` as any);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderFlashcard = (msg: HighlightMsg, titleText: string, icon: keyof typeof Ionicons.glyphMap) => (
        <TouchableOpacity
            style={styles.flashcard}
            activeOpacity={0.8}
            onPress={() => handleJumpToMessage(msg.id)}
        >
            <View style={styles.cardHeader}>
                <Ionicons name={icon} size={20} color={WA_COLORS.primary} />
                <Text style={styles.cardTitle}>{titleText}</Text>
            </View>

            <View style={styles.messageBubble}>
                <Text style={styles.senderName}>{msg.senderName || 'Unknown'}</Text>
                <Text style={styles.messageText}>{msg.content}</Text>
                <View style={styles.metaContainer}>
                    <Text style={styles.timeText}>{formatDate(msg.timestamp)} at {formatTime(msg.timestamp)}</Text>
                </View>
            </View>

            <View style={styles.cardFooter}>
                <Text style={styles.footerText}>Tap to view in context</Text>
                <Ionicons name="chevron-forward" size={16} color={WA_COLORS.primary} />
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primaryDark} barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Highlights</Text>
                    <Text style={styles.headerSubtitle}>{currentChat?.name || 'Loading...'}</Text>
                </View>
            </View>

            <ImageBackground
                source={{ uri: 'https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png' }}
                style={styles.chatBackground}
                imageStyle={{ opacity: 0.1 }}
            >
                {isLoading ? (
                    <ActivityIndicator size="large" color={WA_COLORS.primary} style={styles.loader} />
                ) : (
                    <ScrollView contentContainerStyle={styles.scrollContent}>

                        {/* Real-time or Fallback Date Section */}
                        {onThisDateMatches.matches.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>
                                    {onThisDateMatches.type === 'day' ? 'ON THIS DAY' : 'ON THIS WEEK'}
                                </Text>
                                <Text style={styles.sectionSub}>
                                    {onThisDateMatches.type === 'day' ?
                                        'Messages sent exactly on this date in past years' :
                                        'Messages sent during this calendar week in past years'}
                                </Text>

                                {onThisDateMatches.matches.map((msg, index) => (
                                    <View key={index}>
                                        {renderFlashcard(
                                            msg,
                                            `${new Date().getFullYear() - new Date(msg.timestamp).getFullYear()} year(s) ago`,
                                            'calendar'
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Random Highlights Section */}
                        {randomHighlights.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>RANDOM THROWBACKS</Text>
                                <Text style={styles.sectionSub}>Random memories from the archives</Text>
                                {randomHighlights.map((msg, index) => (
                                    <View key={index}>
                                        {renderFlashcard(msg, 'A blast from the past', 'shuffle')}
                                    </View>
                                ))}
                            </View>
                        )}

                        {onThisDateMatches.matches.length === 0 && randomHighlights.length === 0 && (
                            <View style={styles.emptyState}>
                                <Ionicons name="planet-outline" size={64} color={WA_COLORS.textSecondary} />
                                <Text style={styles.emptyStateText}>No memories found yet.</Text>
                            </View>
                        )}

                    </ScrollView>
                )}
            </ImageBackground>
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
        paddingVertical: 12,
        paddingHorizontal: 5,
        elevation: 4,
        zIndex: 10,
    },
    backButton: {
        padding: 10,
    },
    headerTitleContainer: {
        flex: 1,
        marginLeft: 8,
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
    chatBackground: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 32,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: WA_COLORS.primary,
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    sectionSub: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
        marginBottom: 16,
    },
    flashcard: {
        backgroundColor: WA_COLORS.cardLight,
        borderRadius: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'rgba(0, 128, 105, 0.05)',
        borderBottomWidth: 1,
        borderBottomColor: WA_COLORS.divider,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: WA_COLORS.primaryDark,
        marginLeft: 8,
    },
    messageBubble: {
        padding: 20,
    },
    senderName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#d81b60', // Fallback color, could be dynamic
        marginBottom: 6,
    },
    messageText: {
        fontSize: 16,
        color: WA_COLORS.textPrimary,
        lineHeight: 22,
    },
    metaContainer: {
        marginTop: 12,
        alignItems: 'flex-end',
    },
    timeText: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: WA_COLORS.divider,
        backgroundColor: '#f8f9fa',
    },
    footerText: {
        fontSize: 13,
        fontWeight: '500',
        color: WA_COLORS.primary,
        marginRight: 4,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
    },
    emptyStateText: {
        marginTop: 16,
        fontSize: 16,
        color: WA_COLORS.textSecondary,
    }
});
