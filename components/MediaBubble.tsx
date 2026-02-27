import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { MessageType } from '../modules/parser/types';

interface MediaBubbleProps {
    mediaUri: string;
    type: MessageType;
    content?: string;
}

const WA_COLORS = {
    primary: '#008069',
    textSecondary: '#667781',
};

/**
 * Determines the category of media based on type and URI.
 */
function getMediaCategory(type: MessageType, uri: string): 'image' | 'audio' | 'video' | 'document' | 'sticker' {
    if (type === 'sticker') return 'sticker';
    if (type === 'video') return 'video';
    if (type === 'audio') return 'audio';
    if (type === 'image') return 'image';
    if (type === 'document') return 'document';

    // Fallback: detect from extension
    const lower = uri.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif)$/)) return 'image';
    if (lower.match(/\.(webp)$/)) return 'sticker';
    if (lower.match(/\.(mp4|mov|3gp|avi)$/)) return 'video';
    if (lower.match(/\.(opus|mp3|m4a|wav|ogg|aac)$/)) return 'audio';
    return 'document';
}

/**
 * Inline image viewer with tap-to-fullscreen.
 */
function ImageBubble({ uri }: { uri: string }) {
    const [fullscreen, setFullscreen] = useState(false);

    return (
        <>
            <TouchableOpacity onPress={() => setFullscreen(true)} activeOpacity={0.9}>
                <Image
                    source={{ uri }}
                    style={styles.imageThumb}
                    contentFit="cover"
                    transition={200}
                    placeholder={require('../assets/images/icon.png')}
                />
            </TouchableOpacity>

            <Modal visible={fullscreen} transparent animationType="fade">
                <Pressable style={styles.fullscreenOverlay} onPress={() => setFullscreen(false)}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setFullscreen(false)}>
                        <Ionicons name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Image
                        source={{ uri }}
                        style={styles.fullscreenImage}
                        contentFit="contain"
                        transition={300}
                    />
                </Pressable>
            </Modal>
        </>
    );
}

/**
 * Audio/voice note player with play/pause, seek bar, and duration.
 */
function AudioBubble({ uri, isVoiceNote }: { uri: string; isVoiceNote: boolean }) {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        return () => {
            // Cleanup on unmount
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    const loadAndPlay = useCallback(async () => {
        try {
            if (soundRef.current) {
                // Already loaded, toggle play/pause
                const status = await soundRef.current.getStatusAsync();
                if (status.isLoaded) {
                    if (status.isPlaying) {
                        await soundRef.current.pauseAsync();
                        setIsPlaying(false);
                    } else {
                        // If finished, replay from start
                        if (status.didJustFinish || (status.durationMillis && status.positionMillis >= status.durationMillis)) {
                            await soundRef.current.setPositionAsync(0);
                        }
                        await soundRef.current.playAsync();
                        setIsPlaying(true);
                    }
                }
                return;
            }

            setIsLoading(true);
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true },
                (status) => {
                    if (status.isLoaded) {
                        setPosition(status.positionMillis || 0);
                        setDuration(status.durationMillis || 0);
                        setIsPlaying(status.isPlaying);
                        if (status.didJustFinish) {
                            setIsPlaying(false);
                            setPosition(0);
                        }
                    }
                }
            );
            soundRef.current = newSound;
            setSound(newSound);
            setIsPlaying(true);
        } catch (err) {
            console.warn('[AudioBubble] Playback error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [uri]);

    const formatTime = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    const progress = duration > 0 ? position / duration : 0;

    return (
        <View style={styles.audioContainer}>
            <TouchableOpacity onPress={loadAndPlay} style={styles.audioPlayBtn}>
                {isLoading ? (
                    <ActivityIndicator size="small" color={WA_COLORS.primary} />
                ) : (
                    <Ionicons
                        name={isPlaying ? 'pause' : 'play'}
                        size={24}
                        color={WA_COLORS.primary}
                    />
                )}
            </TouchableOpacity>

            <View style={styles.audioInfo}>
                {/* Progress bar */}
                <View style={styles.audioProgressBg}>
                    <View style={[styles.audioProgressFill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={styles.audioTimeRow}>
                    <Text style={styles.audioTimeText}>{formatTime(position)}</Text>
                    {duration > 0 && (
                        <Text style={styles.audioTimeText}>{formatTime(duration)}</Text>
                    )}
                </View>
            </View>

            {isVoiceNote && (
                <Ionicons name="mic" size={16} color={WA_COLORS.primary} style={{ marginLeft: 4 }} />
            )}
        </View>
    );
}

/**
 * Video placeholder (tap to play - full playback requires expo-video or expo-av Video).
 * Shows a video icon thumbnail since inline video is heavyweight.
 */
function VideoBubble({ uri }: { uri: string }) {
    return (
        <View style={styles.videoContainer}>
            <View style={styles.videoThumb}>
                <Ionicons name="videocam" size={40} color="#fff" />
            </View>
            <View style={styles.videoOverlay}>
                <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
            </View>
            <Text style={styles.videoLabel}>Video</Text>
        </View>
    );
}

/**
 * Sticker bubble - renders webp images slightly differently (no border, transparent bg).
 */
function StickerBubble({ uri }: { uri: string }) {
    return (
        <Image
            source={{ uri }}
            style={styles.stickerImage}
            contentFit="contain"
            transition={200}
        />
    );
}

/**
 * Document attachment placeholder.
 */
function DocumentBubble({ uri, content }: { uri: string; content?: string }) {
    // Try to extract filename from content
    const filename = content?.match(/^(.+?\.\w+)/)?.[1] || 'Document';

    return (
        <View style={styles.documentContainer}>
            <Ionicons name="document-text" size={32} color={WA_COLORS.primary} />
            <Text style={styles.documentName} numberOfLines={1}>{filename}</Text>
        </View>
    );
}

/**
 * Main MediaBubble component - renders appropriate media visualization
 * based on message type and file URI.
 */
export default function MediaBubble({ mediaUri, type, content }: MediaBubbleProps) {
    const category = getMediaCategory(type, mediaUri);
    const isVoiceNote = content?.toLowerCase().includes('ptt-') || false;

    switch (category) {
        case 'image':
            return <ImageBubble uri={mediaUri} />;
        case 'sticker':
            return <StickerBubble uri={mediaUri} />;
        case 'audio':
            return <AudioBubble uri={mediaUri} isVoiceNote={isVoiceNote} />;
        case 'video':
            return <VideoBubble uri={mediaUri} />;
        case 'document':
            return <DocumentBubble uri={mediaUri} content={content} />;
        default:
            return null;
    }
}

const styles = StyleSheet.create({
    // ===== Image =====
    imageThumb: {
        width: 220,
        height: 220,
        borderRadius: 8,
        backgroundColor: '#e0e0e0',
    },
    fullscreenOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullscreenImage: {
        width: '95%',
        height: '80%',
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        padding: 8,
    },

    // ===== Audio / Voice Note =====
    audioContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        minWidth: 200,
    },
    audioPlayBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e7ffdb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    audioInfo: {
        flex: 1,
    },
    audioProgressBg: {
        height: 4,
        backgroundColor: '#d4d4d4',
        borderRadius: 2,
        overflow: 'hidden',
    },
    audioProgressFill: {
        height: '100%',
        backgroundColor: WA_COLORS.primary,
        borderRadius: 2,
    },
    audioTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 3,
    },
    audioTimeText: {
        fontSize: 11,
        color: WA_COLORS.textSecondary,
    },

    // ===== Video =====
    videoContainer: {
        width: 220,
        height: 160,
        borderRadius: 8,
        backgroundColor: '#333',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoThumb: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoOverlay: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoLabel: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
    },

    // ===== Sticker =====
    stickerImage: {
        width: 150,
        height: 150,
    },

    // ===== Document =====
    documentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f2f5',
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
    },
    documentName: {
        marginLeft: 10,
        fontSize: 14,
        color: '#333',
        flex: 1,
    },
});
