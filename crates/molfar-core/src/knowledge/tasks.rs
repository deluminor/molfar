//! Task checkboxes toggled from the preview, matched to the source by
//! document order the same way the preview's Markdown parser counts them.
use super::properties::note_properties;
use pulldown_cmark::{Event, Options, Parser};

/// Flips the `ordinal`-th task (`- [ ]` / `- [x]`) after the frontmatter.
/// Returns `None` when the note has fewer tasks.
pub fn toggle_task(body: &str, ordinal: usize) -> Option<String> {
    let markdown = note_properties(body).1;
    let offset = body.len() - markdown.len();
    let options =
        Options::ENABLE_TASKLISTS | Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;

    let (checked, range) = Parser::new_ext(markdown, options)
        .into_offset_iter()
        .filter_map(|(event, range)| match event {
            Event::TaskListMarker(checked) => Some((checked, range)),
            _ => None,
        })
        .nth(ordinal)?;

    let marker = &markdown[range.clone()];
    let open = marker.find('[')?;
    let at = offset + range.start + open + 1;
    let mut out = String::with_capacity(body.len());
    out.push_str(&body[..at]);
    out.push(if checked { ' ' } else { 'x' });
    out.push_str(&body[at + 1..]);
    Some(out)
}
