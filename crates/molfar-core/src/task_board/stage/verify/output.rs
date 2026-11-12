use super::constants::{TAIL_BYTES, TAIL_LINES};

/// The last lines of a log, bounded by line count and bytes, cut on a char boundary.
pub(super) fn tail(log: &str) -> String {
    let lines: Vec<&str> = log.trim_end().lines().collect();
    let start = lines.len().saturating_sub(TAIL_LINES);
    let text = lines[start..].join("\n");
    if text.len() <= TAIL_BYTES {
        return text;
    }

    let mut cut = text.len() - TAIL_BYTES;
    while !text.is_char_boundary(cut) {
        cut += 1;
    }
    text[cut..].to_owned()
}
