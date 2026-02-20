import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Chat, deleteChatById, getChats, initDatabase } from '../db/db';

interface ChatContextType {
    chats: Chat[];
    activeChatId: number | null;
    isLoading: boolean;
    setActiveChatId: (id: number | null) => void;
    refreshChats: () => Promise<void>;
    removeChat: (id: number) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChatId, setActiveChatId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshChats = async () => {
        try {
            setIsLoading(true);
            const importedChats = await getChats();
            setChats(importedChats);
        } catch (error) {
            console.error("Error fetching chats:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const removeChat = async (id: number) => {
        try {
            await deleteChatById(id);
            await refreshChats();
        } catch (err) {
            console.error("Error deleting chat:", err);
        }
    }

    useEffect(() => {
        // We initialize DB here at the root level, then fetch initial state 
        // to ensure DB is ready before any screen renders.
        const setup = async () => {
            try {
                await initDatabase();
                await refreshChats();
            } catch (err) {
                console.error("Critical DB Init Error:", err);
            }
        };
        setup();
    }, []);

    return (
        <ChatContext.Provider
            value={{
                chats,
                activeChatId,
                isLoading,
                setActiveChatId,
                refreshChats,
                removeChat,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

// Custom hook helper
export function useChatContext() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChatContext must be used within a ChatProvider');
    }
    return context;
}
