import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../context/ChatContext';

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
    const { myName, setMyName } = useChatContext();
    const [inputValue, setInputValue] = useState(myName);

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

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar backgroundColor={WA_COLORS.primary} barStyle="light-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
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
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f0f2f5', // WhatsApp settings background color
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
    }
});
