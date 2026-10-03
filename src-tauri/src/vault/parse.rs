use super::types::{VaultLink, VaultNote};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde_json::Value;
use std::path::Path;

fn property_values(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::String(text)) => vec![text.trim().to_string()],
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn frontmatter(body: &str) -> (Option<Value>, &str, Option<String>) {
    let body = body.strip_prefix('\u{feff}').unwrap_or(body);
    let mut lines = body.split_inclusive('\n');
    if lines.next().is_none_or(|line| line.trim_end() != "---") {
        return (None, body, None);
    }
    let start = body.find('\n').map_or(body.len(), |position| position + 1);
    let mut offset = start;
    for line in lines {
        if matches!(line.trim_end(), "---" | "...") {
            let options = serde_saphyr::options! {
                budget: serde_saphyr::budget! {
                    max_depth: 32,
                    max_events: 10_000,
                    max_aliases: 64,
                    max_total_scalar_bytes: 64 * 1024,
                    max_recorded_anchor_bytes: 64 * 1024,
                },
            };
            let metadata =
                serde_saphyr::from_str_with_options::<Value>(&body[start..offset], options);
            return match metadata {
                Ok(value) => (Some(value), &body[offset + line.len()..], None),
                Err(error) => (
                    None,
                    &body[offset + line.len()..],
                    Some(format!("Invalid frontmatter: {error}")),
                ),
            };
        }
        offset += line.len();
    }

    (None, body, Some("Unclosed frontmatter.".into()))
}

fn wiki_links(text: &str, links: &mut Vec<VaultLink>) {
    let mut remainder = text;
    while let Some(start) = remainder.find("[[") {
        let escaped = remainder[..start]
            .chars()
            .rev()
            .take_while(|character| *character == '\\')
            .count()
            % 2
            == 1;
        remainder = &remainder[start + 2..];
        let Some(end) = remainder.find("]]") else {
            break;
        };
        if !escaped {
            let target = remainder[..end].split('|').next().unwrap_or("").trim();
            if !target.is_empty() {
                links.push(VaultLink {
                    target: target.into(),
                    kind: "wiki".into(),
                });
            }
        }
        remainder = &remainder[end + 2..];
    }
}

pub fn parse_note(path: &str, body: &str) -> (VaultNote, Option<String>) {
    let (metadata, content, warning) = frontmatter(body);
    let mut aliases = property_values(metadata.as_ref().and_then(|value| value.get("aliases")));
    let mut tags = property_values(metadata.as_ref().and_then(|value| value.get("tags")));
    let mut links = Vec::new();
    let mut excluded = Vec::new();
    let mut code_start = None;

    for (event, range) in Parser::new_ext(content, Options::empty()).into_offset_iter() {
        match event {
            Event::Start(Tag::CodeBlock(_)) => code_start = Some(range.start),
            Event::End(TagEnd::CodeBlock) => {
                if let Some(start) = code_start.take() {
                    excluded.push(start..range.end);
                }
            }
            Event::Code(_) | Event::Html(_) | Event::InlineHtml(_) => excluded.push(range),
            Event::Start(Tag::Link { dest_url, .. } | Tag::Image { dest_url, .. }) => {
                let target = dest_url.to_string();
                if !target.is_empty() && !target.contains(':') && !target.starts_with("//") {
                    links.push(VaultLink {
                        target,
                        kind: "markdown".into(),
                    });
                }
            }
            _ => {}
        }
    }
    let mut visible = content.as_bytes().to_vec();
    for range in excluded {
        visible[range].fill(b' ');
    }
    let visible = String::from_utf8(visible).expect("Masked complete UTF-8 ranges remain valid");
    wiki_links(&visible, &mut links);
    for word in visible.split_whitespace() {
        if let Some(tag) = word.strip_prefix('#') {
            let tag = tag.trim_end_matches(|character: char| {
                !character.is_alphanumeric()
                    && character != '/'
                    && character != '_'
                    && character != '-'
            });
            if !tag.is_empty()
                && tag.chars().all(|character| {
                    character.is_alphanumeric() || matches!(character, '/' | '_' | '-')
                })
            {
                tags.push(tag.into());
            }
        }
    }
    aliases.retain(|alias| !alias.is_empty());
    aliases.sort();
    aliases.dedup();
    tags = tags
        .into_iter()
        .map(|tag| tag.trim_start_matches('#').to_string())
        .filter(|tag| !tag.is_empty())
        .collect();
    tags.sort();
    tags.dedup();
    links.sort_by(|left, right| (&left.kind, &left.target).cmp(&(&right.kind, &right.target)));
    links.dedup_by(|left, right| left.kind == right.kind && left.target == right.target);
    let title = metadata
        .as_ref()
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            Path::new(path)
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });

    (
        VaultNote {
            path: path.into(),
            title,
            aliases,
            tags,
            links,
        },
        warning,
    )
}
