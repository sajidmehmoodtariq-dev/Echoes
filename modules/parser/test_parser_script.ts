import * as fs from 'fs';
import * as path from 'path';
import { parseWhatsAppChat } from './index';

async function testParser(filePath: string) {
    console.log(`\n--- Testing ${path.basename(filePath)} ---`);
    const content = fs.readFileSync(filePath, 'utf8');

    // We append some edge cases manually for thorough testing
    const edgeCases = `
20/06/2021, 14:36 - System: Messages to this group are now secured with end-to-end encryption.
20/06/2021, 14:37 - Carol: You deleted this message
20/06/2021, 14:38 - Bob: Missed voice call
20/06/2021, 14:39 - Alice: IMG-20231025-WA0001.jpg (file attached)
20/06/2021, 14:40 - Bob: location: https://maps.google.com/?q=37.7749,-122.4194
`;
    // Add edge cases if testing Android
    const finalContent = filePath.includes('android') ? content + edgeCases : content;

    const result = parseWhatsAppChat(finalContent, path.basename(filePath));

    console.log(`Detected Platform: ${result.chat.sourcePlatform}`);
    console.log(`Warnings: ${result.warnings.length}`);
    if (result.warnings.length > 0) {
        console.log(result.warnings);
    }

    console.log('\nParsed Messages:');
    for (const msg of result.messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        console.log(`[${time}] [${msg.type.toUpperCase()}] ${(msg as any)._rawSender} -> ${msg.content.replace(/\n/g, '\\n').substring(0, 50)}...`);
    }
}

const androidPath = path.join(__dirname, 'test_android.txt');
const iosPath = path.join(__dirname, 'test_ios.txt');

(async () => {
    try {
        await testParser(androidPath);
        await testParser(iosPath);
    } catch (e) {
        console.error("Test failed:", e);
    }
})();
