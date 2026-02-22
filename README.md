# Echoes (WhatsApp Chat Archive)

Echoes is a local-first, offline mobile application built with React Native and Expo that allows you to import, parse, store, and visualize exported WhatsApp chat logs (`.txt` or `.zip` archives). 

It meticulously recreates the familiar WhatsApp UI so you can comfortably read, search, and analyze your historical conversations without relying on cloud services or keeping cumbersome text files around.

## ✨ Features

- **Robust Chat Parsing:** Built-in regex parsers capable of handling both iOS and Android WhatsApp export formats, reliably extracting timestamps, senders, and multiline messages.
- **Lightning Fast Search:** Utilizes advanced SQLite optimizations including FTS5 (Full-Text Search) virtual tables, allowing instantaneous global searches across thousands of archived messages.
- **Cinematic Playback:** Upload an audio track to play synchronously while the message viewer auto-scrolls through the chat. Supports variable and custom playback speeds (up to 10x+).
- **Privacy & Local-First:** 100% offline. All chats are processed entirely in-memory and stored in the device's local SQLite database. No web APIs or external servers are involved.
- **Advanced Metrics:** Queries designed to support analytics (total messages, active days, usage by hour/day) and memory highlights ("On this day").
- **Familiar UI:** Implements WhatsApp's signature visual cues, including deterministic color coding for group chat members, "sent by me" bubble alignment, system message styling, and dynamic date headers.

## 🛠 Tech Stack

- **Frontend:** React Native, Expo (SDK 54), Expo Router (File-based navigation)
- **Database:** `expo-sqlite` (with FTS5 indexing and async transaction controls)
- **Utilities:** `jszip` (in-memory archive extraction), `expo-document-picker`, `expo-av` (audio)

## 🚀 Getting Started

### Prerequisites
Ensure you have Node.js installed, along with the standard React Native / Expo environment components.

### Installation

1. Clone the repository and navigate into the directory:
   ```bash
   git clone https://github.com/your-username/whatsapp-chat.git
   cd whatsapp-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npx expo start
   ```

4. Press `a` to open in the Android emulator, `i` for iOS simulator, or scan the QR code with the Expo Go app.

## 📖 How to Use

1. Go to WhatsApp on your mobile device and open any chat.
2. Tap **More > Export Chat** (Choose "Without Media").
3. Save or send the resulting `.txt` or `.zip` file to your device.
4. Open the Echoes app, tap the **import button** on the home screen, and select your exported file.
5. The application will immediately parse and save the chat locally, creating a beautiful interface for seamless offline reading!
