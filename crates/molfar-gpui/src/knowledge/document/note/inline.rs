//! Obsidian inline syntax the shared Markdown parser leaves as text:
//! `==highlights==` get a marker wash and `#tags` become links that search.
use crate::{knowledge::TAG_SCHEME, markdown_model::InlineRun};

fn is_tag_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '-' | '/')
}

/// Splits plain text into (text, is_tag) pieces at `#tag` words.
fn tag_pieces(text: &str) -> Vec<(String, bool)> {
    let mut out: Vec<(String, bool)> = Vec::new();
    let mut plain = String::new();
    let mut chars = text.char_indices().peekable();
    let mut previous: Option<char> = None;
    while let Some((at, character)) = chars.next() {
        let starts = character == '#'
            && previous.is_none_or(|before| before.is_whitespace() || before == '(');
        if starts {
            let tag: String = text[at + 1..]
                .chars()
                .take_while(|c| is_tag_char(*c))
                .collect();
            let tag = tag.trim_end_matches(['/', '-']).to_string();
            if tag.chars().any(|c| !c.is_ascii_digit()) {
                if !plain.is_empty() {
                    out.push((std::mem::take(&mut plain), false));
                }
                for _ in 0..tag.chars().count() {
                    chars.next();
                }
                previous = tag.chars().last();
                out.push((format!("#{tag}"), true));
                continue;
            }
        }
        plain.push(character);
        previous = Some(character);
    }
    if !plain.is_empty() {
        out.push((plain, false));
    }
    out
}

/// Splits text into (text, highlighted) pieces at `==` pairs.
fn highlight_pieces(text: &str) -> Vec<(String, bool)> {
    let parts: Vec<&str> = text.split("==").collect();
    if parts.len() < 3 {
        return vec![(text.to_string(), false)];
    }
    let closed = if parts.len() % 2 == 1 {
        parts.len()
    } else {
        parts.len() - 1
    };
    let mut out = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        let highlighted = index % 2 == 1 && index < closed;
        let text = if index >= closed {
            format!("=={part}")
        } else {
            part.to_string()
        };
        if !text.is_empty() {
            out.push((text, highlighted));
        }
    }
    out
}

/// Decorates runs in place; code and links are left as they are.
pub(super) fn decorate(runs: &[InlineRun]) -> Vec<InlineRun> {
    let mut out = Vec::with_capacity(runs.len());
    for run in runs {
        if run.style.code || run.style.link.is_some() || run.style.math {
            out.push(run.clone());
            continue;
        }
        for (text, highlighted) in highlight_pieces(&run.text) {
            for (piece, tag) in tag_pieces(&text) {
                let mut style = run.style.clone();
                style.highlight |= highlighted;
                if tag {
                    style.link = Some(format!("{TAG_SCHEME}{}", &piece[1..]));
                }
                out.push(InlineRun { text: piece, style });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown_model::InlineStyle;

    fn run(text: &str) -> InlineRun {
        InlineRun {
            text: text.into(),
            style: InlineStyle::default(),
        }
    }

    #[test]
    fn highlights_and_tags_split_out_of_plain_text() {
        let out = decorate(&[run("Read ==this part== soon #area/dev, not C#7 or #42.")]);
        let texts: Vec<&str> = out.iter().map(|run| run.text.as_str()).collect();
        assert_eq!(
            texts,
            [
                "Read ",
                "this part",
                " soon ",
                "#area/dev",
                ", not C#7 or #42."
            ]
        );
        assert!(out[1].style.highlight);
        assert_eq!(out[3].style.link.as_deref(), Some("molfar-tag:area/dev"));
    }

    #[test]
    fn code_links_and_unpaired_markers_stay_untouched() {
        let mut code = run("#not-a-tag ==x==");
        code.style.code = true;
        let out = decorate(&[code.clone(), run("a == b")]);
        assert_eq!(out[0], code);
        assert_eq!(out[1].text, "a == b");
        assert!(!out[1].style.highlight);
    }
}
