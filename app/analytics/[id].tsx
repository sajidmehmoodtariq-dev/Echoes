import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../../context/ChatContext';
import {
    ChatStats,
    getChatStats,
    getTopSenders,
    getUsageByDayOfWeek,
    getUsageByHourOfDay
} from '../../db/db';

const WA_COLORS = {
    primary: '#008069',
    background: '#f0f2f5',
    cardBackground: '#ffffff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    divider: '#e9edef',
    accent: '#00a884',
};

export default function AnalyticsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { chats } = useChatContext();
    const currentChat = chats.find(c => c.id === Number(id));

    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<ChatStats | null>(null);
    const [topSenders, setTopSenders] = useState<{ senderName: string, count: number }[]>([]);
    const [dayUsage, setDayUsage] = useState<{ day: string, count: number }[]>([]);
    const [hourUsage, setHourUsage] = useState<{ hour: string, count: number }[]>([]);

    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!id) return;
            try {
                setIsLoading(true);
                const chatId = Number(id);

                const [chatStats, senders, days, hours] = await Promise.all([
                    getChatStats(chatId),
                    getTopSenders(chatId, 10),
                    getUsageByDayOfWeek(chatId),
                    getUsageByHourOfDay(chatId)
                ]);

                setStats(chatStats);
                setTopSenders(senders);
                setDayUsage(days);
                setHourUsage(hours);
            } catch (err) {
                console.error("Failed to load analytics:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAnalytics();
    }, [id]);

    const renderHeader = () => (
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View>
                <Text style={styles.headerTitle}>Chat Insights</Text>
                <Text style={styles.headerSubtitle}>{currentChat?.name || 'Unknown Chat'}</Text>
            </View>
        </View>
    );

    const formatNumber = (num: number) => {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (isLoading || !stats) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <StatusBar backgroundColor={WA_COLORS.primary} />
                {renderHeader()}
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={WA_COLORS.primary} />
                    <Text style={styles.loadingText}>Crunching the numbers...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Calculations for charts
    const maxSenderCount = Math.max(...topSenders.map(s => s.count), 1);
    const maxDayCount = Math.max(...dayUsage.map(d => d.count), 1);
    const maxHourCount = Math.max(...hourUsage.map(h => h.count), 1);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primary} barStyle="light-content" />
            {renderHeader()}

            <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>

                {/* KPI Cards */}
                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Ionicons name="chatbubbles" size={24} color={WA_COLORS.accent} />
                        <Text style={styles.kpiValue}>{formatNumber(stats.totalMessages)}</Text>
                        <Text style={styles.kpiLabel}>Total Messages</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Ionicons name="calendar" size={24} color={WA_COLORS.accent} />
                        <Text style={styles.kpiValue}>{formatNumber(stats.activeDays)}</Text>
                        <Text style={styles.kpiLabel}>Active Days</Text>
                    </View>
                </View>

                <View style={styles.kpiRow}>
                    <View style={styles.kpiCard}>
                        <Ionicons name="speedometer" size={24} color={WA_COLORS.accent} />
                        <Text style={styles.kpiValue}>
                            {stats.activeDays > 0 ? Math.round(stats.totalMessages / stats.activeDays) : 0}
                        </Text>
                        <Text style={styles.kpiLabel}>Messages / Day</Text>
                    </View>
                    <View style={styles.kpiCard}>
                        <Ionicons name="time" size={24} color={WA_COLORS.accent} />
                        <Text style={styles.kpiDateLabel}>From: {formatDate(stats.firstMessageDate)}</Text>
                        <Text style={styles.kpiDateLabel}>To: {formatDate(stats.lastMessageDate)}</Text>
                    </View>
                </View>

                {/* Top Senders Leaderboard */}
                {topSenders.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Top Contributors</Text>
                        {topSenders.map((sender, index) => {
                            const percentage = (sender.count / stats.totalMessages) * 100;
                            const barWidth = (sender.count / maxSenderCount) * 100;
                            return (
                                <View key={index} style={styles.leaderboardRow}>
                                    <View style={styles.leaderboardHeader}>
                                        <Text style={styles.senderName} numberOfLines={1}>
                                            {index + 1}. {sender.senderName}
                                        </Text>
                                        <Text style={styles.senderStats}>
                                            {formatNumber(sender.count)} ({percentage.toFixed(1)}%)
                                        </Text>
                                    </View>
                                    <View style={styles.progressBarBackground}>
                                        <View style={[styles.progressBarFill, { width: `${barWidth}%` }]} />
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Day of Week Heatmap (Simple Vertical Bars) */}
                {dayUsage.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Activity by Day</Text>
                        <View style={styles.barChartContainer}>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(shortDay => {
                                // Find the data (SQLite returns Sunday first, we mapped to full names)
                                const fullDayName = shortDay === 'Mon' ? 'Monday' :
                                    shortDay === 'Tue' ? 'Tuesday' :
                                        shortDay === 'Wed' ? 'Wednesday' :
                                            shortDay === 'Thu' ? 'Thursday' :
                                                shortDay === 'Fri' ? 'Friday' :
                                                    shortDay === 'Sat' ? 'Saturday' : 'Sunday';

                                const dayData = dayUsage.find(d => d.day === fullDayName);
                                const count = dayData ? dayData.count : 0;
                                const heightPercent = (count / maxDayCount) * 100;

                                return (
                                    <View key={shortDay} style={styles.barColumn}>
                                        <View style={styles.barWrapper}>
                                            <View style={[styles.barFill, { height: `${heightPercent}%` }]} />
                                        </View>
                                        <Text style={styles.barLabel}>{shortDay}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Hour of Day Heatmap */}
                {hourUsage.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Activity by Hour</Text>
                        <View style={styles.barChartContainer}>
                            {/* Render every 3 hours to fit on screen */}
                            {[0, 3, 6, 9, 12, 15, 18, 21].map(hourBlock => {
                                // Sum the 3 hours in this block
                                let blockCount = 0;
                                for (let i = 0; i < 3; i++) {
                                    const hStr = (hourBlock + i).toString().padStart(2, '0');
                                    const hData = hourUsage.find(h => h.hour === hStr);
                                    if (hData) blockCount += hData.count;
                                }

                                // Calculate max block for scaling (approx)
                                const blockLabel = `${hourBlock}:00`;
                                const heightPercent = Math.min((blockCount / (maxHourCount * 3)) * 100 * 2, 100); // Scaled multiplier

                                return (
                                    <View key={hourBlock} style={styles.barColumn}>
                                        <View style={styles.barWrapper}>
                                            <View style={[styles.barFill, { height: `${heightPercent}%`, backgroundColor: WA_COLORS.primaryDark }]} />
                                        </View>
                                        <Text style={styles.barLabel}>{blockLabel}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: WA_COLORS.primary,
    },
    header: {
        backgroundColor: WA_COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        elevation: 4,
        zIndex: 10,
    },
    backButton: {
        marginRight: 16,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: WA_COLORS.background,
    },
    loadingText: {
        marginTop: 16,
        color: WA_COLORS.textSecondary,
        fontSize: 16,
    },
    scrollContainer: {
        flex: 1,
        backgroundColor: WA_COLORS.background,
    },
    scrollContent: {
        padding: 12,
    },
    kpiRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    kpiCard: {
        backgroundColor: WA_COLORS.cardBackground,
        flex: 1,
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 4,
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    kpiValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginVertical: 4,
    },
    kpiLabel: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
    },
    kpiDateLabel: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
        marginTop: 4,
        fontWeight: '500',
    },
    card: {
        backgroundColor: WA_COLORS.cardBackground,
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 4,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginBottom: 16,
    },
    leaderboardRow: {
        marginBottom: 16,
    },
    leaderboardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    senderName: {
        fontSize: 14,
        fontWeight: '600',
        color: WA_COLORS.textPrimary,
        flex: 1,
    },
    senderStats: {
        fontSize: 13,
        color: WA_COLORS.textSecondary,
    },
    progressBarBackground: {
        height: 6,
        backgroundColor: WA_COLORS.divider,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: WA_COLORS.accent,
        borderRadius: 3,
    },
    barChartContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 150,
        paddingTop: 10,
    },
    barColumn: {
        alignItems: 'center',
        flex: 1,
        height: '100%',
    },
    barWrapper: {
        flex: 1,
        width: '60%',
        backgroundColor: WA_COLORS.divider,
        borderRadius: 4,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        backgroundColor: WA_COLORS.accent,
        borderRadius: 4,
    },
    barLabel: {
        fontSize: 11,
        color: WA_COLORS.textSecondary,
        marginTop: 8,
    }
});
