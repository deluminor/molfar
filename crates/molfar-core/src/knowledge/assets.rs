//! Image embeds: `![[photo.png|300]]` and `![alt](photo.png)` resolve to a
//! vault file and become `molfar-asset:` images the preview can draw.
use super::links::{decode_component, encode_component, normalize_vault_path};
use super::preview::{fence_marker, split_inline_code};
use super::types::VaultEntry;

pub const ASSET_SCHEME: &str = "molfar-asset:";
const WIDTH_MARK: &str = "#w=";
const IMAGE_EXTENSIONS: [&str; 9] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "tiff",
];

pub fn is_image(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, extension)| {
        IMAGE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
    })
}

/// The file on disk for a vault image, refusing anything outside the vault.
pub fn asset_path(root: &std::path::Path, relative: &str) -> Result<std::path::PathBuf, String> {
    super::paths::resolve(root, relative)
}

/// The vault path and optional pixel width behind a `molfar-asset:` URL.
pub fn asset_target(url: &str) -> Option<(String, Option<f32>)> {
    let rest = url.strip_prefix(ASSET_SCHEME)?;
    let (encoded, width) = match rest.split_once(WIDTH_MARK) {
        Some((encoded, width)) => (
            encoded,
            width.parse::<f32>().ok().filter(|width| *width > 0.),
        ),
        None => (rest, None),
    };
    let path = decode_component(encoded)?;
    (normalize_vault_path(&path).as_deref() == Some(path.as_str())).then_some((path, width))
}

/// Finds an image the way Obsidian does: relative to the note, from the
/// vault root, then by unique-ish file name (shortest path wins).
pub fn find_asset(entries: &[VaultEntry], selected: &str, target: &str) -> Option<String> {
    let target = decode_component(target.split('#').next().unwrap_or(target).trim())?;
    if !is_image(&target) {
        return None;
    }
    let images: Vec<&VaultEntry> = entries
        .iter()
        .filter(|entry| !entry.is_dir && is_image(&entry.path))
        .collect();
    let parent = selected
        .rsplit_once('/')
        .map(|(folder, _)| folder)
        .unwrap_or("");
    let relative = normalize_vault_path(&if parent.is_empty() {
        target.clone()
    } else {
        format!("{parent}/{target}")
    });
    for candidate in [relative, normalize_vault_path(&target)]
        .into_iter()
        .flatten()
    {
        if images.iter().any(|entry| entry.path == candidate) {
            return Some(candidate);
        }
    }
    let name = target.rsplit('/').next().unwrap_or(&target).to_lowercase();
    images
        .into_iter()
        .filter(|entry| entry.name.to_lowercase() == name)
        .min_by_key(|entry| (entry.path.matches('/').count(), entry.path.len()))
        .map(|entry| entry.path.clone())
}

fn asset_url(path: &str, width: Option<&str>) -> String {
    let width = width
        .and_then(|width| width.split('x').next())
        .filter(|width| width.trim().parse::<f32>().is_ok())
        .map(|width| format!("{WIDTH_MARK}{}", width.trim()))
        .unwrap_or_default();
    format!("{ASSET_SCHEME}{}{width}", encode_component(path))
}

fn rewrite_wiki(text: &str, entries: &[VaultEntry], selected: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("![[") {
        let Some(end) = rest[start + 3..].find("]]") else {
            break;
        };
        let inner = &rest[start + 3..start + 3 + end];
        let (target, size) = match inner.split_once('|') {
            Some((target, size)) => (target, Some(size)),
            None => (inner, None),
        };
        out.push_str(&rest[..start]);
        match find_asset(entries, selected, target) {
            Some(path) => {
                let alt = target
                    .rsplit('/')
                    .next()
                    .unwrap_or(target)
                    .replace(['[', ']'], "");
                out.push_str(&format!("![{alt}]({})", asset_url(&path, size)));
            }
            None => out.push_str(&rest[start..start + 3 + end + 2]),
        }
        rest = &rest[start + 3 + end + 2..];
    }
    out.push_str(rest);
    out
}

fn rewrite_markdown(text: &str, entries: &[VaultEntry], selected: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("![") {
        let Some(label_end) = rest[start + 2..].find("](") else {
            break;
        };
        let after = start + 2 + label_end + 2;
        let Some(dest_end) = rest[after..].find(')') else {
            break;
        };
        let label = &rest[start + 2..start + 2 + label_end];
        let dest = rest[after..after + dest_end]
            .trim()
            .trim_start_matches('<')
            .trim_end_matches('>');
        out.push_str(&rest[..start]);
        let (alt, size) = match label.rsplit_once('|') {
            Some((alt, size)) if size.trim().parse::<f32>().is_ok() => (alt, Some(size)),
            _ => (label, None),
        };
        let found = if dest.contains(':') {
            None
        } else {
            find_asset(entries, selected, dest)
        };
        match found {
            Some(path) => out.push_str(&format!("![{alt}]({})", asset_url(&path, size))),
            None => out.push_str(&rest[start..after + dest_end + 1]),
        }
        rest = &rest[after + dest_end + 1..];
    }
    out.push_str(rest);
    out
}

/// Rewrites image embeds outside code into `molfar-asset:` images. Embeds
/// that name no image in the vault stay as written.
pub fn embed_images(body: &str, entries: &[VaultEntry], selected: &str) -> String {
    let mut fence: Option<(char, usize)> = None;
    let mut out = String::with_capacity(body.len());
    for line in body.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\n', '\r']);
        if let Some(marker) = fence_marker(trimmed) {
            fence = match fence {
                None => Some(marker),
                Some((kind, length)) if marker.0 == kind && marker.1 >= length => None,
                open => open,
            };
            out.push_str(line);
            continue;
        }
        if fence.is_some() || !line.contains("![") {
            out.push_str(line);
            continue;
        }
        for (code, part) in split_inline_code(trimmed) {
            if code {
                out.push_str(part);
            } else {
                out.push_str(&rewrite_markdown(
                    &rewrite_wiki(part, entries, selected),
                    entries,
                    selected,
                ));
            }
        }
        out.push_str(&line[trimmed.len()..]);
    }
    out
}
