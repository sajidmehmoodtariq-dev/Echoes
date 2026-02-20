import { parseWhatsAppChat } from './modules/parser/index';

const testFile = `28/03/2025, 12:00\u202Fpm - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.
13/10/2025, 11:29\u202Fpm - You: No one knows yahi to main reason hy
kher np waise meinne dyhaan rakha tha but if i said something then i am sorry too
13/10/2025, 11:29\u202Fpm - You: In case if u didn't read
13/10/2025, 11:36\u202Fpm - Saman 24 C: It's fine.
It was a total misunderstanding!
13/10/2025, 11:36\u202Fpm - Saman 24 C: Main khud bhi confuse thi k meri dp ko le k ku bat horhi hai
13/10/2025, 11:36\u202Fpm - Saman 24 C: Aur us pe gusa ku horhy hain.
13/10/2025, 11:36\u202Fpm - Saman 24 C: Mujh3 ni pata tha k. Ap ki ya kisi aur k bary mai bat horhi`;

const result = parseWhatsAppChat(testFile, 'TestChat.txt');

console.log("=== PARSER RESULT ===");
console.log("Platform:", result.chat.sourcePlatform);
console.log("Total messages parsed:", result.messages.length);
console.log("Warnings:", result.warnings);

result.messages.forEach(msg => {
    console.log(`\n[${msg.type.toUpperCase()}] Sender: ${(msg as any)._rawSender || msg.senderId} | Time: ${new Date(msg.timestamp).toISOString()}`);
    console.log(`Content: ${msg.content.substring(0, 50)}...`);
});
