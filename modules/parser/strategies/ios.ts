/**
 * Regular expressions for parsing iOS WhatsApp exports.
 * 
 * Target Format:
 * [20/06/2021, 14:30:00] Sender Name: Message content
 * [20/06/21, 2:30:00 PM] Sender Name: Message content
 */
export const IOS_REGEX = {
    // ^\[                - Matches the starting bracket "["
    // (                  - Start Capture Group 1 (Date)
    //   \d{1,2}          - 1 or 2 digits (Day or Month)
    //   [./-]            - Separator (slash, dot, or dash)
    //   \d{1,2}          - 1 or 2 digits (Month or Day)
    //   [./-]            - Separator
    //   \d{2,4}          - 2 or 4 digits (Year)
    // )                  - End Capture Group 1
    // ,\s                - Comma and a space
    // (                  - Start Capture Group 2 (Time)
    //   \d{1,2}:\d{2}:\d{2} - Hours, Minutes, Seconds (HH:mm:ss)
    //   (?:\s[A-Z]{2})?  - Optional non-capturing group for AM/PM
    // )                  - End Capture Group 2
    // \]                 - Matches the closing bracket "]"
    // \s                 - A trailing space after the timestamp block
    timestampPrefix: /^\[(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),\s(\d{1,2}:\d{2}:\d{2}(?:\s[A-Z]{2})?)\]\s/,

    // Extracts the sender and message body from the remainder of the line.
    // ^(.*?)             - Capture Group 1: Sender Name (non-greedy, stops at first colon)
    // :\s                - Literal colon and space separator
    // (.*)               - Capture Group 2: The actual message content
    senderAndMessage: /^(.*?):\s(.*)/,
};
