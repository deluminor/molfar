//! Obsidian callouts (`> [!note] Title`) split out of a note so they render
//! as cards; everything else stays Markdown.

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Segment {
    Markdown(String),
    Callout {
        kind: String,
        title: String,
        body: String,
    },
}

fn fence(line: &str) -> Option<(char, usize)> {
    let trimmed = line.trim_start();
    let marker = trimmed.chars().next().filter(|c| *c == '`' || *c == '~')?;
    let count = trimmed.chars().take_while(|c| *c == marker).count();
    (count >= 3).then_some((marker, count))
}

fn callout_head(line: &str) -> Option<(String, String)> {
    let rest = line
        .trim_start()
        .strip_prefix('>')?
        .trim_start()
        .strip_prefix("[!")?;
    let (kind, after) = rest.split_once(']')?;
    if kind.is_empty()
        || !kind
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    let title = after.trim_start_matches(['+', '-']).trim();
    Some((kind.to_lowercase(), title.to_string()))
}

fn unquote(line: &str) -> Option<&str> {
    let rest = line.trim_start().strip_prefix('>')?;
    Some(rest.strip_prefix(' ').unwrap_or(rest))
}

pub(crate) fn segments(text: &str) -> Vec<Segment> {
    let mut out = Vec::new();
    let mut markdown = String::new();
    let mut open_fence: Option<(char, usize)> = None;
    let mut lines = text.split_inclusive('\n').peekable();

    while let Some(line) = lines.next() {
        if let Some((marker, count)) = fence(line) {
            open_fence = match open_fence {
                None => Some((marker, count)),
                Some((open, length)) if open == marker && count >= length => None,
                other => other,
            };
        }
        let head = open_fence.is_none().then(|| callout_head(line)).flatten();
        let Some((kind, title)) = head else {
            markdown.push_str(line);
            continue;
        };

        if !markdown.is_empty() {
            out.push(Segment::Markdown(std::mem::take(&mut markdown)));
        }
        let mut body = String::new();
        let mut inner_fence: Option<(char, usize)> = None;
        while let Some(next) = lines.peek().and_then(|line| unquote(line).map(|_| *line)) {
            let quoted = unquote(next).unwrap_or_default();
            if inner_fence.is_none() && callout_head(next).is_some() {
                break;
            }
            if let Some((marker, count)) = fence(quoted) {
                inner_fence = match inner_fence {
                    None => Some((marker, count)),
                    Some((open, length)) if open == marker && count >= length => None,
                    other => other,
                };
            }
            body.push_str(quoted);
            lines.next();
        }
        let title = if title.is_empty() {
            let mut chars = kind.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().chain(chars).collect())
                .unwrap_or_default()
        } else {
            title
        };
        out.push(Segment::Callout { kind, title, body });
    }

    if !markdown.is_empty() {
        out.push(Segment::Markdown(markdown));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callouts_become_cards_with_their_quoted_body() {
        let text = "# Head\n> [!note] 👤 Життя\n> ```dataview\n> list\n> ```\nAfter\n";
        assert_eq!(
            segments(text),
            [
                Segment::Markdown("# Head\n".into()),
                Segment::Callout {
                    kind: "note".into(),
                    title: "👤 Життя".into(),
                    body: "```dataview\nlist\n```\n".into(),
                },
                Segment::Markdown("After\n".into()),
            ]
        );
    }

    #[test]
    fn untitled_and_folded_callouts_use_their_kind_and_adjacent_callouts_split() {
        let text = "> [!TIP]-\n> one\n> [!warning]+ Careful\n> two\n";
        let segments = segments(text);
        assert_eq!(segments.len(), 2);
        assert!(
            matches!(&segments[0], Segment::Callout { kind, title, .. } if kind == "tip" && title == "Tip")
        );
        assert!(
            matches!(&segments[1], Segment::Callout { title, body, .. } if title == "Careful" && body == "two\n")
        );
    }

    #[test]
    fn a_fenced_example_inside_a_callout_stays_in_its_body() {
        let text = "> [!example]\n> ```md\n> [!note] sample\n> ```\n";
        let segments = segments(text);
        assert_eq!(segments.len(), 1);
        assert!(
            matches!(&segments[0], Segment::Callout { body, .. } if body.contains("[!note] sample"))
        );
    }

    #[test]
    fn plain_quotes_and_fenced_examples_stay_markdown() {
        let text = "> quote\n```\n> [!note] not a callout\n```\n";
        assert_eq!(segments(text), [Segment::Markdown(text.into())]);
    }
}
