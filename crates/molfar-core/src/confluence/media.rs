use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
    path::PathBuf,
};

use super::{
    connector::{api_path, field, Connector},
    document::{Document, Node},
    http::Transport,
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
        let mut media = HashSet::new();
        collect(&document.0, &mut media);
        if media.is_empty() {
            return HashMap::new();
        }

        let attachments_path = format!("{path}/attachments");
        let mut images = HashMap::new();
        let mut cursor = None::<String>;
        for _ in 0..10 {
            let mut pairs = vec![("limit", "50")];
            if let Some(cursor) = &cursor {
                pairs.push(("cursor", cursor.as_str()));
            }
            let (attachments, next) = match self.collection(&api_path(&attachments_path, &pairs)) {
                Ok(collection) => collection,
                Err(error) => {
                    log::debug!("Confluence attachment listing failed: {}", error.kind());
                    return images;
                }
            };
            for attachment in attachments {
                let title = field(&attachment, "title");
                let file_id = field(&attachment, "fileId");
                let attachment_id = field(&attachment, "id");
                if ![title.as_str(), file_id.as_str(), attachment_id.as_str()]
                    .iter()
                    .any(|key| media.contains(key))
                {
                    continue;
                }

                if attachment_id.is_empty() {
                    log::debug!("Confluence image failed: missing attachment ID");
                    continue;
                }

                let mut download = field(&attachment, "downloadLink");
                if download.is_empty() {
                    download = field(&attachment["_links"], "download");
                }
                let key = format!("{id}:{attachment_id}:{version}");
                let path = match self.image(&key, &download) {
                    Ok(path) => path,
                    Err(reason) => {
                        log::debug!("Confluence image failed: {reason}");
                        continue;
                    }
                };
                for name in [title, file_id, attachment_id] {
                    if media.remove(name.as_str()) {
                        images.insert(name, path.clone());
                    }
                }
                if images.len() >= MAX_IMAGES || media.is_empty() {
                    return images;
                }
            }

            if next.is_none() || cursor == next {
                break;
            }
            cursor = next;
        }
        if !media.is_empty() {
            log::debug!(
                "Confluence images unresolved after attachment lookup: {}",
                media.len()
            );
        }
        images
    }

    fn image(&self, key: &str, download: &str) -> Result<PathBuf, &'static str> {
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

        let download = if download.starts_with("/download/") {
            format!("/wiki{download}")
        } else {
            download.to_owned()
        };
        let bytes = self
            .client
            .request_attachment(&download)
            .map_err(|error| error.kind())?
            .bytes;
        let mut reader = image::ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|_| "image format detection failed")?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);
        let image = reader.decode().map_err(|error| match error {
            image::ImageError::Limits(_) => "image exceeds decode limits",
            image::ImageError::Unsupported(_) => "unsupported image format",
            _ => "image decode failed",
        })?;
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

fn collect<'a>(nodes: &'a [Node], media: &mut HashSet<&'a str>) {
    for node in nodes {
        match node {
            Node::Media(id, _) if !id.is_empty() => {
                media.insert(id);
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
