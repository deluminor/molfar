use crate::markdown::{self, Tone};
use gpui::AnyElement;

pub(super) fn rows(prepared: &str) -> Vec<AnyElement> {
    let mut rows = Vec::new();
    for block in &crate::markdown_model::parse_full_hard_breaks(prepared).blocks {
        for (index, row) in markdown::rows(&block.block).into_iter().enumerate() {
            let id = gpui::SharedString::from(format!("knowledge-markdown-{index}-{}", rows.len()));
            rows.push(markdown::body(
                &row,
                id,
                Tone::Normal,
                None,
                std::time::Instant::now(),
            ));
        }
    }
    rows
}
