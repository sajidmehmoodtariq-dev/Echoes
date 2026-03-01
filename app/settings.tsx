import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../context/ChatContext';
import BackupManager from '../components/BackupManager';
import RestoreManager from '../components/RestoreManager';
import {
    configureGoogleSignIn,
    signIn,
    signOut,
    getCurrentUser,
    isSignedIn,
} from '../modules/google/auth';
import { getChats } from '../db/db';

const WA_COLORS = {
    primary: '#008069',
    background: '#ffffff',
    textPrimary: '#111b21',
    textSecondary: '#667781',
    divider: '#e9edef',
    button: '#00a884'
};

export default function SettingsScreen() {
    const router = useRouter();
    const { myName, setMyName, refreshChats } = useChatContext();
    const [inputValue, setInputValue] = useState(myName);

    // Google account state
    const [googleUser, setGoogleUser] = useState<{ email: string; name: string | null; photo: string | null } | null>(null);
    const [isGoogleLoading, setIsGoogleLoading] = useState(true);
    const [isSigningIn, setIsSigningIn] = useState(false);

    // Modal state
    const [showBackup, setShowBackup] = useState(false);
    const [showRestore, setShowRestore] = useState(false);

    // Chat list for backup manager
    const [chats, setChats] = useState<any[]>([]);

    useEffect(() => {
        initGoogle();
    }, []);

    const initGoogle = async () => {
        try {
            configureGoogleSignIn();
            const signed = await isSignedIn();
            if (signed) {
                const user = await getCurrentUser();
                if (user) {
                    setGoogleUser({
                        email: user.user.email,
                        name: user.user.name,
                        photo: user.user.photo,
                    });
                }
            }
        } catch (err) {
            console.error('[Settings] Google init error:', err);
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        try {
            const userInfo = await signIn();
            if (userInfo) {
                setGoogleUser({
                    email: userInfo.data?.user?.email ?? '',
                    name: userInfo.data?.user?.name ?? null,
                    photo: userInfo.data?.user?.photo ?? null,
                });
            }
        } catch (err: any) {
            console.error('[Settings] Sign in error:', err);
            Alert.alert('Sign In Failed', err.message || 'Could not sign in to Google.');
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleGoogleSignOut = async () => {
        Alert.alert('Sign Out', 'Disconnect your Google account?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                onPress: async () => {
                    try {
                        await signOut();
                        setGoogleUser(null);
                    } catch (err: any) {
                        console.error('[Settings] Sign out error:', err);
                    }
                },
            },
        ]);
    };

    const openBackup = async () => {
        try {
            const allChats = await getChats();
            setChats(allChats);
            setShowBackup(true);
        } catch (err) {
            console.error('[Settings] Failed to load chats:', err);
            Alert.alert('Error', 'Failed to load chats.');
        }
    };

    const handleSave = async () => {
        const trimmed = inputValue.trim();
        if (!trimmed) {
            Alert.alert("Error", "Name cannot be empty.");
            return;
        }
        await setMyName(trimmed);
        Alert.alert("Success", "Your display name has been saved.", [
            { text: "OK", onPress: () => router.back() }
        ]);
    };

    const handleChatRestored = useCallback(() => {
        refreshChats();
    }, [refreshChats]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primary} barStyle="light-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
            </View>

            <ScrollView style={styles.content}>
                {/* Identity Section */}
                <View style={styles.section}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="person-circle-outline" size={60} color={WA_COLORS.primary} />
                    </View>

                    <Text style={styles.label}>Your WhatsApp Name</Text>
                    <Text style={styles.description}>
                        Enter your exact display name from WhatsApp. This helps the app identify your messages
                        to correctly align them on the right side with green bubbles, especially in group chats.
                    </Text>

                    <TextInput
                        style={styles.input}
                        value={inputValue}
                        onChangeText={setInputValue}
                        placeholder="e.g. John Doe"
                        placeholderTextColor={WA_COLORS.textSecondary}
                        autoCapitalize="words"
                    />

                    <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                        <Text style={styles.saveButtonText}>Save Identity</Text>
                    </TouchableOpacity>
                </View>

                {/* Cloud Backup Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="cloud-outline" size={24} color={WA_COLORS.primary} />
                        <Text style={styles.sectionTitle}>Cloud Backup</Text>
                    </View>

                    <Text style={styles.description}>
                        Back up your chats to Google Drive and restore them on any device with this app.
                    </Text>

                    {/* Google Account */}
                    {isGoogleLoading ? (
                        <ActivityIndicator size="small" color={WA_COLORS.primary} style={{ marginVertical: 12 }} />
                    ) : googleUser ? (
                        <View style={styles.googleRow}>
                            <View style={styles.googleAvatar}>
                                <Ionicons name="logo-google" size={20} color="#fff" />
                            </View>
                            <View style={styles.googleInfo}>
                                <Text style={styles.googleEmail}>{googleUser.email}</Text>
                                <Text style={styles.googleName}>{googleUser.name || 'Google Account'}</Text>
                            </View>
                            <TouchableOpacity onPress={handleGoogleSignOut} style={styles.signOutBtn}>
                                <Ionicons name="log-out-outline" size={18} color={WA_COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.googleSignInBtn}
                            onPress={handleGoogleSignIn}
                            disabled={isSigningIn}
                        >
                            {isSigningIn ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="logo-google" size={18} color="#fff" />
                                    <Text style={styles.googleSignInText}>Connect Google Account</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    {/* Backup / Restore buttons */}
                    {googleUser && (
                        <View style={styles.backupActions}>
                            <TouchableOpacity style={styles.backupActionBtn} onPress={openBackup}>
                                <Ionicons name="cloud-upload-outline" size={22} color={WA_COLORS.primary} />
                                <Text style={styles.backupActionText}>Back Up Chats</Text>
                                <Ionicons name="chevron-forward" size={18} color={WA_COLORS.textSecondary} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.backupActionBtn}
                                onPress={() => setShowRestore(true)}
                            >
                                <Ionicons name="cloud-download-outline" size={22} color={WA_COLORS.primary} />
                                <Text style={styles.backupActionText}>Restore from Drive</Text>
                                <Ionicons name="chevron-forward" size={18} color={WA_COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Backup Modal */}
            <Modal visible={showBackup} animationType="slide" onRequestClose={() => setShowBackup(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: WA_COLORS.background }}>
                    <BackupManager chats={chats} onDone={() => setShowBackup(false)} />
                </SafeAreaView>
            </Modal>

            {/* Restore Modal */}
            <Modal visible={showRestore} animationType="slide" onRequestClose={() => setShowRestore(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: WA_COLORS.background }}>
                    <RestoreManager
                        onDone={() => setShowRestore(false)}
                        onChatRestored={handleChatRestored}
                    />
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f0f2f5',
    },
    header: {
        backgroundColor: WA_COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        elevation: 4,
    },
    backButton: {
        marginRight: 16,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
    },
    section: {
        backgroundColor: WA_COLORS.background,
        marginTop: 16,
        padding: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: WA_COLORS.divider,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: WA_COLORS.textPrimary,
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: WA_COLORS.textPrimary,
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        color: WA_COLORS.textSecondary,
        lineHeight: 20,
        marginBottom: 20,
    },
    input: {
        borderBottomWidth: 2,
        borderBottomColor: WA_COLORS.primary,
        fontSize: 18,
        color: WA_COLORS.textPrimary,
        paddingVertical: 8,
        marginBottom: 32,
    },
    saveButton: {
        backgroundColor: WA_COLORS.button,
        paddingVertical: 14,
        borderRadius: 24,
        alignItems: 'center',
        elevation: 2,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Google Account styles
    googleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f7fa',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    googleAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#4285f4',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    googleInfo: {
        flex: 1,
    },
    googleEmail: {
        fontSize: 14,
        fontWeight: '600',
        color: WA_COLORS.textPrimary,
    },
    googleName: {
        fontSize: 12,
        color: WA_COLORS.textSecondary,
        marginTop: 1,
    },
    signOutBtn: {
        padding: 8,
    },
    googleSignInBtn: {
        flexDirection: 'row',
        backgroundColor: '#4285f4',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
    },
    googleSignInText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    backupActions: {
        marginTop: 4,
        gap: 2,
    },
    backupActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: WA_COLORS.divider,
        gap: 12,
    },
    backupActionText: {
        flex: 1,
        fontSize: 15,
        color: WA_COLORS.textPrimary,
    },
});
