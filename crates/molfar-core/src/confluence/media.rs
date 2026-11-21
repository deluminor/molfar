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
            let Ok((attachments, next)) = self.collection(&api_path(&attachments_path, &pairs))
            else {
                break;
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

                let download = field(&attachment, "downloadLink");
                let key = format!("{id}:{attachment_id}:{version}");
                let Some(path) = self.image(&key, &download) else {
                    continue;
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
        images
    }

    fn image(&self, key: &str, download: &str) -> Option<PathBuf> {
        let path = self.cache.image_path(key)?;
        if path.is_file() {
            return Some(path);
        }
        if download.is_empty() {
            return None;
        }

        let download = if download.starts_with("/download/") {
            format!("/wiki{download}")
        } else {
            download.to_owned()
        };
        let bytes = self.client.request(&download).ok()?.bytes;
        let mut reader = image::ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .ok()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);
        let image = reader.decode().ok()?;
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, image::ImageFormat::Png).ok()?;

        self.cache
            .write_image(key, &png.into_inner())
            .ok()
            .flatten()
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
