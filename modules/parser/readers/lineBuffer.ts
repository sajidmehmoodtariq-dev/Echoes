
/**
 * A buffer helper to handle reading files in chunks.
 * It accumulates string data and yields complete lines,
 * holding back any partial line at the end until the next chunk arrives.
 */
export class LineBuffer {
    private buffer: string = '';

    constructor() { }

    /**
     * Adds a chunk of text to the buffer and returns all complete lines found.
     * @param chunk The new text chunk to append
     * @param isLastChunk If true, returns the final remainder even if it doesn't end in newline
     */
    addChunk(chunk: string, isLastChunk: boolean = false): string[] {
        this.buffer += chunk;

        // Split by newline. 
        // If the buffer ends with a newline, the last element will be empty string.
        // If it doesn't, the last element is the partial line to keep.
        const lines = this.buffer.split(/\r?\n/);

        if (isLastChunk) {
            this.buffer = '';
            return lines; // Return everything including the last partial line
        }

        // Keep the last part in the buffer (it might be incomplete)
        this.buffer = lines.pop() || '';

        return lines;
    }

    /**
     * Flushes any remaining data in the buffer.
     */
    flush(): string[] {
        if (!this.buffer) return [];
        const remaining = [this.buffer];
        this.buffer = '';
        return remaining;
    }
}
