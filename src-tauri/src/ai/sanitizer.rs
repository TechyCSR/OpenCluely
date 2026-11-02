//! Chunk-Level Stream Sanitizer
//! Strips internal chain-of-thought blocks (<think>, <reasoning>, <thought>)
//! across arbitrary streaming chunk boundaries so only clean answers reach the UI.

pub struct StreamSanitizer {
    in_reasoning_block: bool,
    tag_buffer: String,
}

impl StreamSanitizer {
    pub fn new() -> Self {
        Self {
            in_reasoning_block: false,
            tag_buffer: String::new(),
        }
    }

    /// Filters streamed tokens in real-time. Returns Some(clean_text) or None if still buffering tags.
    pub fn process_chunk(&mut self, chunk: &str) -> Option<String> {
        self.tag_buffer.push_str(chunk);

        let mut output = String::new();

        while !self.tag_buffer.is_empty() {
            if self.in_reasoning_block {
                // Look for closing tags: </think>, </reasoning>, </thought>
                if let Some(pos) = self.tag_buffer.find("</think>") {
                    self.tag_buffer = self.tag_buffer[(pos + 8)..].to_string();
                    self.in_reasoning_block = false;
                } else if let Some(pos) = self.tag_buffer.find("</reasoning>") {
                    self.tag_buffer = self.tag_buffer[(pos + 12)..].to_string();
                    self.in_reasoning_block = false;
                } else if let Some(pos) = self.tag_buffer.find("</thought>") {
                    self.tag_buffer = self.tag_buffer[(pos + 10)..].to_string();
                    self.in_reasoning_block = false;
                } else {
                    // Still inside a reasoning block, suppress output
                    return if output.is_empty() { None } else { Some(output) };
                }
            } else {
                // Look for opening tags: <think>, <reasoning>, <thought>
                if let Some(pos) = self.find_opening_tag(&self.tag_buffer) {
                    let pre_tag = &self.tag_buffer[..pos];
                    output.push_str(pre_tag);

                    // Skip the tag
                    let tag_len = self.get_tag_len(&self.tag_buffer[pos..]);
                    self.tag_buffer = self.tag_buffer[(pos + tag_len)..].to_string();
                    self.in_reasoning_block = true;
                } else {
                    // Check if buffer ends with a partial tag like "<thi"
                    if let Some(bracket_pos) = self.tag_buffer.rfind('<') {
                        if !self.tag_buffer[bracket_pos..].contains('>') {
                            let safe_part = &self.tag_buffer[..bracket_pos];
                            output.push_str(safe_part);
                            self.tag_buffer = self.tag_buffer[bracket_pos..].to_string();
                            return if output.is_empty() { None } else { Some(output) };
                        }
                    }

                    output.push_str(&self.tag_buffer);
                    self.tag_buffer.clear();
                }
            }
        }

        if output.is_empty() {
            None
        } else {
            Some(output)
        }
    }

    fn find_opening_tag(&self, text: &str) -> Option<usize> {
        let tags = ["<think>", "<reasoning>", "<thought>"];
        tags.iter().filter_map(|t| text.find(t)).min()
    }

    fn get_tag_len(&self, text: &str) -> usize {
        if text.starts_with("<think>") {
            7
        } else if text.starts_with("<reasoning>") {
            11
        } else if text.starts_with("<thought>") {
            9
        } else {
            0
        }
    }
}
