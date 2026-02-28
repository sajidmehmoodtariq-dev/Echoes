import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Modal,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../../context/ChatContext';
import { getMediaMessages, Message } from '../../db/db';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const TILE_GAP = 2;
const TILE_SIZE = (SCREEN_WIDTH - TILE_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

const WA_COLORS = {
    primary: '#008069',
    primaryDark: '#005c4b',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    background: '#fff',
    tabActive: '#008069',
    tabInactive: '#667781',
};

type MediaCategory = 'all' | 'images' | 'videos' | 'audio' | 'documents';

type MediaItem = Message & { senderName?: string };

/**
 * Determines simple category from message type and URI.
 */
function categorize(item: MediaItem): 'images' | 'videos' | 'audio' | 'documents' {
    const type = item.type;
    const uri = (item.mediaUri || '').toLowerCase();

    if (type === 'image' || type === 'sticker') return 'images';
    if (type === 'video') return 'videos';
    if (type === 'audio') return 'audio';
    if (type === 'document') return 'documents';

    // Fallback via extension
    if (uri.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'images';
    if (uri.match(/\.(mp4|mov|3gp|avi)$/)) return 'videos';
    if (uri.match(/\.(opus|mp3|m4a|wav|ogg|aac)$/)) return 'audio';
    return 'documents';
}

const TABS: { key: MediaCategory; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'apps' },
    { key: 'images', label: 'Photos', icon: 'image' },
    { key: 'videos', label: 'Videos', icon: 'videocam' },
    { key: 'audio', label: 'Audio', icon: 'musical-notes' },
    { key: 'documents', label: 'Docs', icon: 'document-text' },
];

export default function GalleryScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { chats } = useChatContext();

    const currentChat = chats.find(c => c.id === Number(id));
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [activeTab, setActiveTab] = useState<MediaCategory>('all');
    const [isLoading, setIsLoading] = useState(true);

    // Fullscreen image viewer
    const [viewerUri, setViewerUri] = useState<string | null>(null);
    const [viewerIndex, setViewerIndex] = useState(0);

    useEffect(() => {
        loadMedia();
    }, [id]);

    const loadMedia = async () => {
        try {
            setIsLoading(true);
            const items = await getMediaMessages(Number(id));
            setMedia(items);
        } catch (err) {
            console.error('Failed to load media:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Filtered items based on active tab
    const filteredMedia = useMemo(() => {
        if (activeTab === 'all') return media;
        return media.filter(item => categorize(item) === activeTab);
    }, [media, activeTab]);

    // Count per category
    const counts = useMemo(() => {
        const c = { all: media.length, images: 0, videos: 0, audio: 0, documents: 0 };
        media.forEach(item => {
            c[categorize(item)]++;
        });
        return c;
    }, [media]);

    // Get only image/sticker items for fullscreen viewer navigation
    const viewableImages = useMemo(() => {
        return filteredMedia.filter(item => {
            const cat = categorize(item);
            return cat === 'images' || item.type === 'video';
        });
    }, [filteredMedia]);

    const formatDate = (timestamp: number) => {
        const d = new Date(timestamp);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getFileExtension = (uri: string) => {
        const match = uri.match(/\.(\w+)$/);
        return match ? match[1].toUpperCase() : '';
    };

    const openImageViewer = (item: MediaItem) => {
        const idx = viewableImages.findIndex(i => i.id === item.id);
        setViewerIndex(idx >= 0 ? idx : 0);
        setViewerUri(item.mediaUri || null);
    };

    const renderMediaTile = ({ item }: { item: MediaItem }) => {
        const cat = categorize(item);

        if (cat === 'images') {
            return (
                <TouchableOpacity
                    style={styles.tile}
                    activeOpacity={0.8}
                    onPress={() => openImageViewer(item)}
                >
                    <Image
                        source={{ uri: item.mediaUri }}
                        style={styles.tileImage}
                        contentFit="cover"
                        transition={150}
                    />
                    {item.type === 'sticker' && (
                        <View style={styles.tileBadge}>
                            <Text style={styles.tileBadgeText}>Sticker</Text>
                        </View>
                    )}
                </TouchableOpacity>
            );
        }

        if (cat === 'videos') {
            return (
                <TouchableOpacity
                    style={styles.tile}
                    activeOpacity={0.8}
                    onPress={() => openImageViewer(item)}
                >
                    <View style={[styles.tileImage, styles.videoTile]}>
                        <Ionicons name="videocam" size={28} color="#fff" />
                        <Ionicons
                            name="play-circle"
                            size={36}
                            color="rgba(255,255,255,0.85)"
                            style={styles.videoPlayIcon}
                        />
                    </View>
                    <View style={styles.tileBadge}>
                        <Text style={styles.tileBadgeText}>Video</Text>
                    </View>
                </TouchableOpacity>
            );
        }

        if (cat === 'audio') {
            const isVoice = item.content?.toLowerCase().includes('ptt-');
            return (
                <View style={styles.tile}>
                    <View style={[styles.tileImage, styles.audioTile]}>
                        <Ionicons
                            name={isVoice ? 'mic' : 'musical-notes'}
                            size={28}
                            color={WA_COLORS.primary}
                        />
                        <Text style={styles.audioExt} numberOfLines={1}>
                            {getFileExtension(item.mediaUri || '')}
                        </Text>
                    </View>
                </View>
            );
        }

        // Documents
        return (
            <View style={styles.tile}>
                <View style={[styles.tileImage, styles.docTile]}>
                    <Ionicons name="document-text" size={28} color={WA_COLORS.primary} />
                    <Text style={styles.docExt} numberOfLines={1}>
                        {getFileExtension(item.mediaUri || '')}
                    </Text>
                </View>
            </View>
        );
    };

    const renderImageViewer = () => {
        if (!viewerUri) return null;
        const currentItem = viewableImages[viewerIndex];

        return (
            <Modal visible={!!viewerUri} transparent animationType="fade">
                <View style={styles.viewerContainer}>
                    <StatusBar backgroundColor="#000" barStyle="light-content" />

                    {/* Header */}
                    <View style={styles.viewerHeader}>
                        <TouchableOpacity onPress={() => setViewerUri(null)} style={styles.viewerCloseBtn}>
                            <Ionicons name="arrow-back" size={24} color="#fff" />
                        </TouchableOpacity>
                        <View style={styles.viewerHeaderInfo}>
                            <Text style={styles.viewerSender} numberOfLines={1}>
                                {currentItem?.senderName || 'Unknown'}
                            </Text>
                            <Text style={styles.viewerDate}>
                                {currentItem ? formatDate(currentItem.timestamp) : ''}
                            </Text>
                        </View>
                        <Text style={styles.viewerCounter}>
                            {viewerIndex + 1} / {viewableImages.length}
                        </Text>
                    </View>

                    {/* Image */}
                    <Pressable style={styles.viewerImageContainer} onPress={() => setViewerUri(null)}>
                        <Image
                            source={{ uri: currentItem?.mediaUri }}
                            style={styles.viewerImage}
                            contentFit="contain"
                            transition={200}
                        />
                    </Pressable>

                    {/* Navigation arrows */}
                    {viewerIndex > 0 && (
                        <TouchableOpacity
                            style={[styles.viewerNav, styles.viewerNavLeft]}
                            onPress={() => {
                                const newIdx = viewerIndex - 1;
                                setViewerIndex(newIdx);
                                setViewerUri(viewableImages[newIdx]?.mediaUri || null);
                            }}
                        >
                            <Ionicons name="chevron-back" size={32} color="#fff" />
                        </TouchableOpacity>
                    )}
                    {viewerIndex < viewableImages.length - 1 && (
                        <TouchableOpacity
                            style={[styles.viewerNav, styles.viewerNavRight]}
                            onPress={() => {
                                const newIdx = viewerIndex + 1;
                                setViewerIndex(newIdx);
                                setViewerUri(viewableImages[newIdx]?.mediaUri || null);
                            }}
                        >
                            <Ionicons name="chevron-forward" size={32} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primaryDark} barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {currentChat?.name || 'Gallery'}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {counts.all} media item{counts.all !== 1 ? 's' : ''}
                    </Text>
                </View>
            </View>

            {/* Tab bar */}
            <View style={styles.tabBar}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    const count = counts[tab.key];
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, isActive && styles.tabActive]}
                            onPress={() => setActiveTab(tab.key)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={tab.icon as any}
                                size={18}
                                color={isActive ? WA_COLORS.tabActive : WA_COLORS.tabInactive}
                            />
                            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                {tab.label}
                            </Text>
                            {count > 0 && (
                                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                                    <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                                        {count}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Grid */}
            {isLoading ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Loading media...</Text>
                </View>
            ) : filteredMedia.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="image-off-outline" size={64} color="#ccc" />
                    <Text style={styles.emptyText}>No media found</Text>
                    <Text style={styles.emptySubtext}>
                        {activeTab === 'all'
                            ? 'Import a chat with media attached to see it here'
                            : `No ${activeTab} in this chat`}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredMedia}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderMediaTile}
                    numColumns={NUM_COLUMNS}
                    contentContainerStyle={styles.gridContainer}
                    columnWrapperStyle={styles.gridRow}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Fullscreen image viewer */}
            {renderImageViewer()}
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
        paddingHorizontal: 12,
        elevation: 4,
    },
    backButton: {
        padding: 5,
        marginRight: 12,
    },
    headerInfo: {
        flex: 1,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    headerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        marginTop: 1,
    },

    // Tab bar
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5e5',
        elevation: 2,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        gap: 4,
    },
    tabActive: {
        borderBottomColor: WA_COLORS.tabActive,
    },
    tabLabel: {
        fontSize: 12,
        color: WA_COLORS.tabInactive,
        fontWeight: '500',
    },
    tabLabelActive: {
        color: WA_COLORS.tabActive,
        fontWeight: '600',
    },
    tabBadge: {
        backgroundColor: '#e5e5e5',
        borderRadius: 8,
        paddingHorizontal: 5,
        paddingVertical: 1,
        marginLeft: 2,
    },
    tabBadgeActive: {
        backgroundColor: 'rgba(0,128,105,0.15)',
    },
    tabBadgeText: {
        fontSize: 10,
        color: WA_COLORS.tabInactive,
        fontWeight: '600',
    },
    tabBadgeTextActive: {
        color: WA_COLORS.tabActive,
    },

    // Grid
    gridContainer: {
        paddingTop: TILE_GAP,
        paddingHorizontal: TILE_GAP,
        paddingBottom: 32,
        backgroundColor: WA_COLORS.background,
    },
    gridRow: {
        gap: TILE_GAP,
        marginBottom: TILE_GAP,
    },
    tile: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        borderRadius: 4,
        overflow: 'hidden',
    },
    tileImage: {
        width: '100%',
        height: '100%',
        backgroundColor: '#e0e0e0',
    },
    tileBadge: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
    },
    tileBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
    },
    videoTile: {
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPlayIcon: {
        position: 'absolute',
    },
    audioTile: {
        backgroundColor: '#e7ffdb',
        justifyContent: 'center',
        alignItems: 'center',
    },
    audioExt: {
        fontSize: 10,
        color: WA_COLORS.textSecondary,
        marginTop: 4,
        fontWeight: '600',
    },
    docTile: {
        backgroundColor: '#f0f2f5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    docExt: {
        fontSize: 10,
        color: WA_COLORS.textSecondary,
        marginTop: 4,
        fontWeight: '600',
    },

    // Empty state
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: WA_COLORS.background,
        paddingHorizontal: 32,
    },
    emptyText: {
        fontSize: 16,
        color: WA_COLORS.textSecondary,
        fontWeight: '500',
        marginTop: 12,
    },
    emptySubtext: {
        fontSize: 13,
        color: '#aaa',
        textAlign: 'center',
        marginTop: 4,
    },

    // Fullscreen viewer
    viewerContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    viewerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    viewerCloseBtn: {
        padding: 5,
        marginRight: 12,
    },
    viewerHeaderInfo: {
        flex: 1,
    },
    viewerSender: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    viewerDate: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
    },
    viewerCounter: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
    viewerImageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    viewerImage: {
        width: '100%',
        height: '100%',
    },
    viewerNav: {
        position: 'absolute',
        top: '50%',
        marginTop: -25,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    viewerNavLeft: {
        left: 8,
    },
    viewerNavRight: {
        right: 8,
    },
});
