use std::{collections::HashMap, path::PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    connector::{api_path, field, valid_id, webui, Connector, Kind},
    document::{adf, markdown, storage, Document},
    error::ConfluenceError,
    http::Transport,
};

const MAX_PAGE_CHARS: usize = 120_000;
const TRUNCATION: &str = "\n\n_Confluence page truncated._";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub url: String,
    pub space_id: String,
    pub parent_id: Option<String>,
    pub parent_kind: Kind,
    pub version: u64,
    pub updated: String,
    pub author: String,
    pub labels: Vec<String>,
    pub document: Document,
    pub images: HashMap<String, PathBuf>,
}

impl Page {
    pub fn markdown(&self) -> (String, bool) {
        let mut markdown = markdown::export(&self.document, &self.url);
        let Some((_, _)) = markdown.char_indices().nth(MAX_PAGE_CHARS) else {
            return (markdown, false);
        };
        let index = markdown
            .char_indices()
            .nth(MAX_PAGE_CHARS - TRUNCATION.chars().count())
            .map_or(markdown.len(), |(index, _)| index);
        markdown.truncate(index);
        markdown.push_str(TRUNCATION);
        (markdown, true)
    }
}

impl<T: Transport> Connector<T> {
    pub fn cached_page(&self, id: &str) -> Option<Page> {
        let version: u64 = self.cache.read("pages", &format!("{id}:latest"), None)?;
        self.cache.read("pages", &format!("{id}:{version}"), None)
    }

    pub fn page(&self, id: &str, refresh: bool) -> Result<Page, ConfluenceError> {
        if !valid_id(id) {
            return Err(ConfluenceError::NotFound);
        }

        let path = format!("/wiki/api/v2/pages/{id}");
        if !refresh {
            if let Some(cached) = self.cached_page(id) {
                match self.client.json::<Value>(&path) {
                    Ok(head) if head["version"]["number"].as_u64() == Some(cached.version) => {
                        return Ok(cached)
                    }
                    Ok(_) => (),
                    Err(ConfluenceError::Offline) => return Ok(cached),
                    Err(error) => return Err(error),
                }
            }
        }

        match self.fetch_page(id, &path) {
            Ok(page) => {
                if self
                    .cache
                    .write("pages", &format!("{id}:{}", page.version), &page)
                    .is_ok()
                {
                    self.cache
                        .write("pages", &format!("{id}:latest"), &page.version)
                        .ok();
                }
                Ok(page)
            }
            Err(ConfluenceError::Offline) => self.cached_page(id).ok_or(ConfluenceError::Offline),
            Err(error) => Err(error),
        }
    }

    fn fetch_page(&self, id: &str, path: &str) -> Result<Page, ConfluenceError> {
        let data: Value = self
            .client
            .json(&api_path(path, &[("body-format", "atlas_doc_format")]))?;
        let version = data["version"]["number"]
            .as_u64()
            .ok_or(ConfluenceError::InvalidResponse)?;
        let document = if let Some(body) = data
            .pointer("/body/atlas_doc_format/value")
            .and_then(Value::as_str)
        {
            adf::parse(body).map_err(|_| ConfluenceError::InvalidResponse)?
        } else if let Some(body) = data.pointer("/body/storage/value").and_then(Value::as_str) {
            storage::parse(body).map_err(|_| ConfluenceError::InvalidResponse)?
        } else {
            Document::default()
        };
        let url = self.url(
            webui(&data),
            &format!("/wiki/pages/viewpage.action?pageId={id}"),
        );
        let parent = field(&data, "parentId");
        let author_id = field(&data["version"], "authorId");
        let labels = self
            .collection(&format!("{path}/labels?limit=50"))
            .map(|(rows, _)| {
                rows.iter()
                    .map(|row| field(row, "name"))
                    .filter(|name| !name.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        Ok(Page {
            id: id.to_owned(),
            title: field(&data, "title"),
            url,
            space_id: field(&data, "spaceId"),
            parent_id: valid_id(&parent).then_some(parent),
            parent_kind: Kind::parse(&field(&data, "parentType")),
            version,
            updated: field(&data["version"], "createdAt"),
            author: self.author(&author_id),
            labels,
            images: self.images(path, id, version, &document),
            document,
        })
    }

    fn author(&self, author_id: &str) -> String {
        if author_id.is_empty() {
            return String::new();
        }
        let path = api_path("/wiki/rest/api/user", &[("accountId", author_id)]);
        self.client
            .json::<Value>(&path)
            .ok()
            .map(|row| field(&row, "displayName"))
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| author_id.to_owned())
    }

    pub fn folder(&self, id: &str) -> Result<(String, String), ConfluenceError> {
        if !valid_id(id) {
            return Err(ConfluenceError::NotFound);
        }
        let row: Value = self.client.json(&format!("/wiki/api/v2/folders/{id}"))?;
        Ok((field(&row, "title"), field(&row, "spaceId")))
    }
}
