
// Mocking expo-file-system for local node testing if needed, 
// OR we can run this inside the Expo app? 
// Since we used `expo-file-system` which is a native module, we CANNOT run this with plain `node`.
// We must mock `expo-file-system` or run it in the Expo runner.

// Let's create a mock for `expo-file-system` so we can run this logical test in node.
// This is faster than booting up the simulator.

import * as fs from 'fs';
import * as path from 'path';

// Mock Module
const mockFileSystem = {
    readAsStringAsync: async (uri: string, options: any) => {
        // Determine path from URI
        const filePath = uri.replace('file://', '');

        // Read file
        const content = fs.readFileSync(filePath, 'utf8');

        // Simulate chunk reading
        const position = options.position || 0;
        const length = options.length || content.length;

        return content.substring(position, position + length);
    },
    getInfoAsync: async (uri: string) => {
        const filePath = uri.replace('file://', '');
        try {
            const stats = fs.statSync(filePath);
            return { exists: true, size: stats.size };
        } catch (e) {
            return { exists: false, size: 0 };
        }
    },
    EncodingType: {
        UTF8: 'utf8',
        Base64: 'base64'
    }
};

// We need to inject this mock into chunkReader.ts somehow, or just copy the logic here for the test.
// For simplicity in this environment, I'll rewrite the test to use the parser Logic directly 
// but we need to hijack the `import` of expo-file-system. 
// Since we can't easily module-mock in this environment without jest setup,
// I will create a `test_parser.ts` that includes a modified version of `readLinesInChunks` that uses `fs`.

import { ANDROID_REGEX, parseAndroidLine } from './strategies/android';
import { IOS_REGEX, parseIOSLine } from './strategies/ios';
import { Platform } from './types';

// RE-IMPLEMENTATION OF chunkReader with Node FS for testing
async function readLinesInChunksNode(
    filePath: string,
    onLines: (lines: string[]) => Promise<void>
) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Simple split for testing logic (ignoring chunk complexity for now to test regex/parsing)
    // Logic test:
    const lines = content.split(/\r?\n/);
    await onLines(lines);
}

// DUPLICATE OF index.ts logic but using `readLinesInChunksNode`
async function testParser(filePath: string) {
    console.log(`\n--- Testing ${path.basename(filePath)} ---`);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    let platform: Platform = 'unknown';
    let lineCount = 0;
    let lastMessage: any = null;

    for (const line of lines) {
        lineCount++;
        if (platform === 'unknown') {
            if (ANDROID_REGEX.timestampPrefix.test(line)) platform = 'android';
            else if (IOS_REGEX.timestampPrefix.test(line)) platform = 'ios';
            if (platform !== 'unknown') console.log(`Detected Platform: ${platform}`);
        }

        let parsedLine = null;
        if (platform === 'android') parsedLine = parseAndroidLine(line);
        else if (platform === 'ios') parsedLine = parseIOSLine(line);

        if (parsedLine) {
            console.log(`[MSG] ${parsedLine.timeStr} ${parsedLine.sender}: ${parsedLine.message.substring(0, 20)}...`);
            lastMessage = parsedLine;
        } else if (lastMessage) {
            console.log(`[CONT] ... ${line.substring(0, 20)}`);
        }
    }
}

// RUN TESTS
const androidPath = path.join(__dirname, 'test_android.txt');
const iosPath = path.join(__dirname, 'test_ios.txt');

(async () => {
    await testParser(androidPath);
    await testParser(iosPath);
})();
