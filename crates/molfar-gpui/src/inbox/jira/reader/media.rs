use std::{collections::HashMap, path::Path};

use molfar_core::jira::{self, Issue, issue::Attachment};
use pulldown_cmark::{Event, Parser, Tag, TagEnd};

use crate::knowledge::{PreviewBlock, parse_preview};

pub(super) fn description_preview(issue: &Issue, directory: &Path) -> Vec<PreviewBlock> {
    let markdown = &issue.description;
    let mut events = Parser::new(markdown).into_offset_iter();
    let mut previews = Vec::new();
    let mut images = HashMap::new();
    let mut cursor = 0;

    while let Some((event, range)) = events.next() {
        let Event::Start(Tag::Image { dest_url, .. }) = event else {
            continue;
        };
        let Some(id) = dest_url.strip_prefix("attachment://") else {
            continue;
        };

        let mut alt = String::new();
        for (event, _) in events.by_ref() {
            match event {
                Event::Text(text) | Event::Code(text) => alt.push_str(&text),
                Event::End(TagEnd::Image) => break,
                _ => (),
            }
        }
        let Some(attachment) = resolve(&issue.attachments, id, &alt) else {
            continue;
        };
        if range.start < cursor {
            continue;
        }

        let path = images.entry(&attachment.id).or_insert_with(|| {
            attachment
                .is_image()
                .then(|| jira::cached_image(directory, &attachment.id))
                .flatten()
        });
        previews.extend(parse_preview(markdown[cursor..range.start].trim(), None));
        previews.push(PreviewBlock::Image {
            path: path.clone(),
            alt: if alt.is_empty() {
                attachment.name.clone()
            } else {
                alt
            },
            width: None,
        });
        cursor = range.end;
    }
    previews.extend(parse_preview(markdown[cursor..].trim(), None));
    previews
}

fn resolve<'a>(attachments: &'a [Attachment], id: &str, alt: &str) -> Option<&'a Attachment> {
    if !jira::valid_media_id(id) {
        return None;
    }
    if let Some(attachment) = attachments.iter().find(|attachment| attachment.id == id) {
        return Some(attachment);
    }
    if alt.is_empty() || uuid::Uuid::parse_str(id).is_err() {
        return None;
    }

    let mut matches = attachments
        .iter()
        .filter(|attachment| attachment.name == alt);
    let attachment = matches.next()?;
    matches.next().is_none().then_some(attachment)
}
