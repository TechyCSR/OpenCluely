/**
 * Chunk-Level Stream Sanitizer
 * Strips internal chain-of-thought blocks (<think>, <reasoning>, <thought>)
 * across arbitrary streaming chunk boundaries so only clean answers reach the UI.
 */
class StreamSanitizer {
  constructor() {
    this.inReasoningBlock = false;
    this.tagBuffer = "";
  }

  reset() {
    this.inReasoningBlock = false;
    this.tagBuffer = "";
  }

  processChunk(chunk) {
    if (!chunk) return "";
    this.tagBuffer += chunk;

    let output = "";

    while (this.tagBuffer.length > 0) {
      if (this.inReasoningBlock) {
        // Look for closing tags
        const closingTags = ["</think>", "</reasoning>", "</thought>"];
        let foundPos = -1;
        let foundTagLen = 0;

        for (const tag of closingTags) {
          const idx = this.tagBuffer.indexOf(tag);
          if (idx !== -1 && (foundPos === -1 || idx < foundPos)) {
            foundPos = idx;
            foundTagLen = tag.length;
          }
        }

        if (foundPos !== -1) {
          this.tagBuffer = this.tagBuffer.slice(foundPos + foundTagLen);
          this.inReasoningBlock = false;
        } else {
          // Still inside reasoning block, suppress all output
          return output;
        }
      } else {
        // Look for opening tags
        const openingTags = ["<think>", "<reasoning>", "<thought>"];
        let foundPos = -1;
        let foundTagLen = 0;

        for (const tag of openingTags) {
          const idx = this.tagBuffer.indexOf(tag);
          if (idx !== -1 && (foundPos === -1 || idx < foundPos)) {
            foundPos = idx;
            foundTagLen = tag.length;
          }
        }

        if (foundPos !== -1) {
          output += this.tagBuffer.slice(0, foundPos);
          this.tagBuffer = this.tagBuffer.slice(foundPos + foundTagLen);
          this.inReasoningBlock = true;
        } else {
          // Check for trailing partial tag like "<thi"
          const lastBracket = this.tagBuffer.lastIndexOf("<");
          if (lastBracket !== -1 && !this.tagBuffer.slice(lastBracket).includes(">")) {
            output += this.tagBuffer.slice(0, lastBracket);
            this.tagBuffer = this.tagBuffer.slice(lastBracket);
            return output;
          }

          output += this.tagBuffer;
          this.tagBuffer = "";
        }
      }
    }

    return output;
  }
}

module.exports = { StreamSanitizer };
