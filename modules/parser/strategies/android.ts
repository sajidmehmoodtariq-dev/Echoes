/**
 * Regular expressions for parsing Android WhatsApp exports.
 * 
 * Target Format:
 * 20/06/2021, 14:30 - Sender Name: Message content
 * 20/06/21, 2:30 pm - Sender Name: Message content
 */
export const ANDROID_REGEX = {
    // ^                  - Matches from the very beginning of the line
    // (                  - Start Capture Group 1 (Date)
    //   \d{1,2}          - 1 or 2 digits (Day or Month)
    //   [./-]            - Separator (slash, dot, or dash)
    //   \d{1,2}          - 1 or 2 digits (Month or Day)
    //   [./-]            - Separator
    //   \d{2,4}          - 2 to 4 digits for year
    // )                  - End Capture Group 1
    // ,\s                - Comma and space
    // (                  - Start Capture Group 2 (Time)
    //   \d{1,2}:\d{2}    - Hours and Minutes (HH:mm)
    //   (?:\s[a-zA-Z]{2})? - Optional non-capturing group for AM/PM (case-insensitive)
    // )                  - End Capture Group 2
    // \s-\s              - Space, dash, space (the specific Android separator)
    timestampPrefix: /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),\s(\d{1,2}:\d{2}(?:\s[a-zA-Z]{2})?)\s-\s/,

    // Extracts the sender and message body from the remainder of the line.
    // ^(.*?)             - Capture Group 1: Sender Name (non-greedy, stops at first colon)
    // :\s                - Colon followed by space
    // (.*)               - Capture Group 2: The actual message content
    senderAndMessage: /^(.*?):\s(.*)/,
};
