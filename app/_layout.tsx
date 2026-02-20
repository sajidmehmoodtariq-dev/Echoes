import { Stack } from 'expo-router';
import { ChatProvider } from '../context/ChatContext';

export default function RootLayout() {
  return (
    <ChatProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ChatProvider>
  );
}
