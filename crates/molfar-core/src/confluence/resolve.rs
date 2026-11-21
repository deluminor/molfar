use std::{
    collections::{HashMap, HashSet},
    ops::Range,
    sync::LazyLock,
};

use regex::Regex;
use serde::{Deserialize, Serialize};
use url::Url;

use super::{
    connector::{valid_id, Connector, Kind},
    error::ConfluenceError,
    http::Transport,
    spaces::{valid_key, Space},
};

pub const PREFIX: &str = "confluence/";
const MAX_MENTIONS: usize = 8;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Link {
    pub host: String,
    pub space: String,
    pub content: Option<String>,
    pub kind: Option<Kind>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mention {
    pub kind: Kind,
    pub id: String,
    pub link: Option<Link>,
}

impl Mention {
    pub fn token(&self) -> String {
        format!("@{PREFIX}{}/{}", self.kind.label(), self.id)
    }

    fn failure(&self) -> String {
        format!(
            "_Could not load Confluence {} {}._",
            self.kind.label(),
            self.id
        )
    }
}

impl Link {
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        let url = Url::parse(text).ok()?;
        if url.scheme() != "molfar"
            || url.host_str() != Some("confluence")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.fragment().is_some()
        {
            return None;
        }
        let mut path = url.path_segments()?;
        let host = path.next()?;
        let parsed = Url::parse(&format!("https://{host}")).ok()?;
        let origin = parsed.origin().ascii_serialization();
        let canonical = origin.strip_prefix("https://")?;
        if !host.eq_ignore_ascii_case(canonical)
            && !host.eq_ignore_ascii_case(&format!("{canonical}:443"))
        {
            return None;
        }
        let space = path.next()?.to_owned();
        let content = path.next().map(str::to_owned);
        if !valid_key(&space)
            || content.as_deref().is_some_and(|id| !valid_id(id))
            || path.next().is_some()
        {
            return None;
        }
        let mut kind = None;
        for (name, value) in url.query_pairs() {
            if name != "kind" || kind.is_some() || content.is_none() {
                return None;
            }
            kind = match value.as_ref() {
                "folder" => Some(Kind::Folder),
                "page" => Some(Kind::Page),
                _ => return None,
            };
        }
        Some(Self {
            host: canonical.to_owned(),
            space,
            content,
            kind,
        })
    }

    pub fn url(&self) -> String {
        let project = format!("molfar://confluence/{}/{}", self.host, self.space);
        self.content
            .as_ref()
            .map_or_else(|| project.clone(), |id| format!("{project}/{id}"))
    }

    pub fn prepared_url(&self) -> String {
        let mut url = self.url();
        if let Some(kind @ (Kind::Folder | Kind::Page)) = self.kind {
            url.push_str("?kind=");
            url.push_str(kind.label());
        }
        url
    }

    pub fn mention(&self) -> Mention {
        let (kind, id) = self.content.as_ref().map_or_else(
            || (Kind::Space, self.space.clone()),
            |id| (self.kind.unwrap_or(Kind::Page), id.clone()),
        );
        Mention {
            kind,
            id,
            link: Some(self.clone()),
        }
    }

    pub fn matches_site(&self, site: &Url) -> bool {
        site.origin().ascii_serialization().strip_prefix("https://") == Some(self.host.as_str())
    }
}

fn token(text: &str) -> Option<Mention> {
    let (kind, id) = text.strip_prefix("@confluence/")?.split_once('/')?;
    let kind = match kind {
        "page" if valid_id(id) => Kind::Page,
        "folder" if valid_id(id) => Kind::Folder,
        "space" if valid_key(id) => Kind::Space,
        _ => return None,
    };
    Some(Mention {
        kind,
        id: id.to_owned(),
        link: None,
    })
}

pub fn scan(text: &str) -> Vec<(Range<usize>, Mention)> {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"(?:^|[\s(\[{])(@confluence/[A-Za-z0-9_~/\-]+|molfar://confluence/[^\s)\]}>]+)")
            .expect("Confluence mention pattern")
    });
    let mut matches = Vec::new();
    let mut offset = 0;
    let mut fenced = false;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fenced = !fenced;
        } else if !fenced && !trimmed.starts_with('>') {
            matches.extend(PATTERN.captures_iter(line).filter_map(|capture| {
                let hit = capture.get(1)?;
                let source = hit
                    .as_str()
                    .trim_end_matches(['.', ',', '!', ':', ';', '?']);
                let end = hit.start() + source.len();
                if let Some(next) = line[end..].chars().next() {
                    if !next.is_whitespace() && !")]},.!:;?".contains(next) {
                        return None;
                    }
                }
                let mention =
                    token(source).or_else(|| Link::parse(source).map(|link| link.mention()))?;
                Some((offset + hit.start()..offset + end, mention))
            }));
        }
        offset += line.len();
    }
    matches
}

pub fn preserve_links(text: &str, links: &HashMap<String, Link>) -> String {
    let mut prepared = text.to_owned();
    for (range, mention) in scan(text).into_iter().rev() {
        if mention.link.is_none() {
            if let Some(link) = links.get(&mention.token()) {
                prepared.replace_range(range, &link.prepared_url());
            }
        }
    }
    prepared
}

pub fn apply(text: &str, mut fetch: impl FnMut(&Mention) -> Result<String, String>) -> String {
    let mentions = scan(text);
    if mentions.is_empty() {
        return text.to_owned();
    }
    let mut body = text.to_owned();
    for (range, mention) in mentions.iter().rev() {
        if mention.link.is_some() {
            body.replace_range(range.clone(), &mention.token());
        }
    }
    let mut seen = HashSet::new();
    let mut contexts = Vec::new();
    for (_, mention) in mentions {
        let site = mention.link.as_ref().map(|link| link.host.clone());
        if !seen.insert((mention.kind.label(), mention.id.clone(), site)) {
            continue;
        }
        if contexts.len() == MAX_MENTIONS {
            contexts.push("_Additional Confluence mentions omitted._".to_owned());
            break;
        }
        let heading = mention.token();
        let markdown = fetch(&mention).unwrap_or_else(|_| mention.failure());
        contexts.push(format!("### {heading}\n\n{markdown}"));
    }
    format!(
        "{body}\n\n## Confluence context\n\n{}",
        contexts.join("\n\n")
    )
}

impl<T: Transport> Connector<T> {
    pub fn resolve_mention(&self, mention: &Mention) -> Result<String, ConfluenceError> {
        if mention
            .link
            .as_ref()
            .is_some_and(|link| !link.matches_site(self.site()))
        {
            return Err(ConfluenceError::NotFound);
        }
        let spaces = || self.spaces(false);
        match mention.kind {
            Kind::Page => match self.page(&mention.id, false) {
                Ok(page) => Ok(page.markdown().0),
                Err(ConfluenceError::NotFound)
                    if mention
                        .link
                        .as_ref()
                        .is_some_and(|link| link.kind.is_none()) =>
                {
                    let link = mention.link.as_ref().ok_or(ConfluenceError::NotFound)?;
                    let space = spaces()?
                        .into_iter()
                        .find(|space| space.key == link.space)
                        .ok_or(ConfluenceError::NotFound)?;
                    self.child_index(&space, Some((&mention.id, Kind::Folder)))
                }
                Err(error) => Err(error),
            },
            Kind::Space => {
                let space = spaces()?
                    .into_iter()
                    .find(|space| space.key == mention.id)
                    .ok_or(ConfluenceError::NotFound)?;
                self.child_index(&space, None)
            }
            Kind::Folder => {
                let space_id = if let Some(link) = &mention.link {
                    spaces()?
                        .into_iter()
                        .find(|space| space.key == link.space)
                        .map(|space| space.id)
                        .ok_or(ConfluenceError::NotFound)?
                } else {
                    self.folder(&mention.id)?.1
                };
                let space = spaces()?
                    .into_iter()
                    .find(|space| space.id == space_id)
                    .ok_or(ConfluenceError::NotFound)?;
                self.child_index(&space, Some((&mention.id, Kind::Folder)))
            }
            _ => Err(ConfluenceError::NotFound),
        }
    }

    pub fn child_index(
        &self,
        space: &Space,
        parent: Option<(&str, Kind)>,
    ) -> Result<String, ConfluenceError> {
        let children = self.children(space, parent, None, false)?;
        Ok(self.index(&children.nodes))
    }
}

#[cfg(test)]
#[path = "resolve_tests.rs"]
mod tests;
