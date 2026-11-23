use std::{
    collections::{BTreeMap, HashMap},
    io::Cursor,
    path::PathBuf,
};

use serde_json::Value;

use crate::atlassian::decode_image;

use super::{
    connector::{api_path, field, valid_id, Connector},
    document::{Document, Node},
    http::{Transport, REST_ATTACHMENT_PATH},
};

const MAX_IMAGES: usize = 40;

impl<T: Transport> Connector<T> {
    pub(super) fn images(
        &self,
        path: &str,
        id: &str,
        version: u64,
        document: &Document,
    ) -> HashMap<String, PathBuf> {
        let mut media = BTreeMap::new();
        collect(&document.0, &mut media);
        if media.is_empty() {
            return HashMap::new();
        }

        let (attachments, complete) = self.image_attachments(path);
        let mut images = HashMap::new();
        for (media_id, alt) in media {
            let exact = unique_attachment(&attachments, |item| {
                ["id", "fileId"]
                    .iter()
                    .any(|key| field(item, key) == media_id)
            });
            let attachment = match exact {
                Ok(Some(item)) => Some(item),
                Ok(None) if complete => {
                    match unique_attachment(&attachments, |item| field(item, "title") == media_id) {
                        Ok(None) if !alt.is_empty() => {
                            unique_attachment(&attachments, |item| field(item, "title") == alt)
                                .ok()
                                .flatten()
                        }
                        result => result.ok().flatten(),
                    }
                }
                _ => None,
            };
            let Some(attachment) = attachment else {
                continue;
            };

            let mime = field(attachment, "mediaType");
            if !mime.is_empty() && !mime.starts_with("image/") {
                continue;
            }
            let attachment_id = field(attachment, "id");
            if !valid_id(attachment_id.strip_prefix("att").unwrap_or(&attachment_id)) {
                continue;
            }
            let mut download = field(attachment, "downloadLink");
            if download.is_empty() {
                download = field(&attachment["_links"], "download");
            }
            let key = format!("{id}:{attachment_id}:{version}");
            match self.image(&key, id, &attachment_id, &download) {
                Ok(path) => {
                    images.insert(media_id.to_owned(), path);
                    if images.len() >= MAX_IMAGES {
                        break;
                    }
                }
                Err(reason) => log::debug!("Confluence image failed: {reason}"),
            }
        }
        images
    }

    fn image_attachments(&self, path: &str) -> (Vec<Value>, bool) {
        let path = format!("{path}/attachments");
        let mut attachments = Vec::new();
        let mut cursor = None::<String>;
        for _ in 0..10 {
            let mut pairs = vec![("limit", "50")];
            if let Some(cursor) = &cursor {
                pairs.push(("cursor", cursor));
            }
            let (items, next) = match self.collection(&api_path(&path, &pairs)) {
                Ok(collection) => collection,
                Err(error) => {
                    log::debug!("Confluence attachment listing failed: {}", error.kind());
                    return (attachments, false);
                }
            };
            attachments.extend(items);
            if next.is_none() {
                return (attachments, true);
            }
            if cursor == next {
                break;
            }
            cursor = next;
        }
        (attachments, false)
    }

    fn image(
        &self,
        key: &str,
        page: &str,
        attachment: &str,
        download: &str,
    ) -> Result<PathBuf, &'static str> {
        let path = self
            .cache
            .image_path(key)
            .ok_or("image cache unavailable")?;
        if path.is_file() {
            return Ok(path);
        }
        if download.is_empty() {
            return Err("missing download link");
        }

        let download =
            if download.starts_with("/download/") || download.starts_with("/rest/api/content/") {
                format!("/wiki{download}")
            } else {
                download.to_owned()
            };
        let url = self
            .site()
            .join(&download)
            .map_err(|_| "invalid download URL")?;
        if url.path().starts_with(REST_ATTACHMENT_PATH)
            && url.path()
                != format!("{REST_ATTACHMENT_PATH}{page}/child/attachment/{attachment}/download")
        {
            return Err("download route does not match the attachment");
        }

        let bytes = self
            .client
            .request_attachment(url.as_str())
            .map_err(|error| error.kind())?
            .bytes;
        let image = decode_image(&bytes)?;
        let mut png = Cursor::new(Vec::new());
        image
            .write_to(&mut png, image::ImageFormat::Png)
            .map_err(|_| "PNG encoding failed")?;

        self.cache
            .write_image(key, &png.into_inner())
            .map_err(|_| "image cache write failed")?
            .ok_or("image cache unavailable")
    }
}

fn unique_attachment(
    attachments: &[Value],
    matches: impl Fn(&Value) -> bool,
) -> Result<Option<&Value>, ()> {
    let mut matches = attachments.iter().filter(|value| matches(value));
    let item = matches.next();
    if matches.next().is_some() {
        return Err(());
    }
    Ok(item)
}

pub(super) fn has_missing_images(document: &Document, images: &HashMap<String, PathBuf>) -> bool {
    let mut media = BTreeMap::new();
    collect(&document.0, &mut media);
    media.keys().any(|id| !images.contains_key(*id))
}

fn collect<'a>(nodes: &'a [Node], media: &mut BTreeMap<&'a str, &'a str>) {
    for node in nodes {
        match node {
            Node::Media(id, alt) if !id.is_empty() => {
                media.entry(id).or_insert(alt);
            }
            Node::Paragraph(nodes)
            | Node::Heading(_, nodes)
            | Node::List(_, nodes)
            | Node::Item(_, nodes)
            | Node::Table(nodes)
            | Node::Row(nodes)
            | Node::Cell(nodes)
            | Node::Panel(_, nodes)
            | Node::Expand(_, nodes)
            | Node::Strong(nodes)
            | Node::Emphasis(nodes)
            | Node::Strike(nodes)
            | Node::InlineCode(nodes)
            | Node::Link(_, nodes)
            | Node::PageLink(_, nodes) => collect(nodes, media),
            _ => (),
        }
    }
}

#[cfg(test)]
mod tests;
