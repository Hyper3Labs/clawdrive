/// Text chunking utilities for ClawDrive.

/// Split text into overlapping chunks.
pub fn chunk_text(text: &str, max_size: usize, overlap: usize) -> Vec<String> {
    if text.len() <= max_size {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + max_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();

        // Try to break at sentence boundary
        let chunk = if end < chars.len() {
            if let Some(pos) = chunk.rfind(". ") {
                chars[start..start + pos + 1].iter().collect()
            } else {
                chunk
            }
        } else {
            chunk
        };

        let chunk_len = chunk.chars().count();
        chunks.push(chunk);
        start += chunk_len.saturating_sub(overlap);
    }

    chunks
}

/// Detect the language of a text sample.
pub fn detect_language(text: &str) -> &'static str {
    let sample = &text[..text.len().min(500)];

    if sample.chars().any(|c| matches!(c, '\u{4e00}'..='\u{9fff}')) {
        "zh"
    } else if sample.chars().any(|c| matches!(c, '\u{3040}'..='\u{309f}')) {
        "ja"
    } else if sample.chars().any(|c| matches!(c, '\u{0400}'..='\u{04ff}')) {
        "ru"
    } else {
        "en"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_text_small() {
        let chunks = chunk_text("Hello world", 100, 20);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hello world");
    }

    #[test]
    fn test_chunk_text_overlap() {
        let text = "a".repeat(250);
        let chunks = chunk_text(&text, 100, 20);
        assert!(chunks.len() >= 3);
    }

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language("Hello world"), "en");
        assert_eq!(detect_language("Привет мир"), "ru");
    }
}
