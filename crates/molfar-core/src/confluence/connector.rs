use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use super::{
    cache::Cache,
    config,
    error::ConfluenceError,
    http::{Client, Http, Transport},
};
use crate::{secrets::SecretStore, store::Store};

pub struct Connector<T = Http> {
    pub(super) client: Client<T>,
    pub(super) cache: Cache,
}

impl Connector {
    pub fn open(db: &Store, secrets: &SecretStore) -> Result<Self, String> {
        let (client, cache) = config::client(db, secrets)?;
        Ok(Self { client, cache })
    }
}

impl<T: Transport> Connector<T> {
    pub fn test_connection(&self) -> Result<(), ConfluenceError> {
        self.client
            .request("/wiki/api/v2/spaces?limit=1")
            .map(|_| ())
    }

    pub fn site(&self) -> &Url {
        &self.client.site
    }

    pub(super) fn collection(
        &self,
        path: &str,
    ) -> Result<(Vec<Value>, Option<String>), ConfluenceError> {
        let response = self.client.request(path)?;
        let body: Value = serde_json::from_slice(&response.bytes)
            .map_err(|_| ConfluenceError::InvalidResponse)?;
        let next = body
            .pointer("/_links/next")
            .and_then(Value::as_str)
            .or_else(|| response.link.as_deref().and_then(next_link))
            .and_then(|link| self.site().join(link).ok())
            .and_then(|url| {
                url.query_pairs()
                    .find(|(key, _)| key == "cursor")
                    .map(|(_, value)| value.into_owned())
            });
        let nodes = body
            .get("results")
            .and_then(Value::as_array)
            .ok_or(ConfluenceError::InvalidResponse)?;

        Ok((nodes.clone(), next))
    }

    pub(super) fn url(&self, api_path: &str, fallback: &str) -> String {
        let candidate = if api_path.starts_with("/spaces/") || api_path.starts_with("/pages/") {
            format!("/wiki{api_path}")
        } else {
            api_path.to_owned()
        };

        self.site()
            .join(&candidate)
            .ok()
            .filter(|url| {
                !api_path.is_empty()
                    && url.origin() == self.site().origin()
                    && url.username().is_empty()
                    && url.password().is_none()
            })
            .or_else(|| self.site().join(fallback).ok())
            .map_or_else(String::new, |url| url.to_string())
    }
}

fn next_link(header: &str) -> Option<&str> {
    header.split(',').find_map(|value| {
        let (link, relation) = value.trim().split_once('>')?;
        relation
            .contains("rel=\"next\"")
            .then(|| link.strip_prefix('<'))
            .flatten()
    })
}

pub(super) fn field(value: &Value, key: &str) -> String {
    let value = &value[key];
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|id| id.to_string()))
        .unwrap_or_default()
}

pub(super) fn api_path(path: &str, pairs: &[(&str, &str)]) -> String {
    let query: String = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish();
    format!("{path}?{query}")
}

pub fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|byte| byte.is_ascii_digit())
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Page,
    Folder,
    Space,
    Database,
    Whiteboard,
    Embed,
    Other,
}

impl Kind {
    pub(super) fn parse(name: &str) -> Self {
        match name {
            "" | "page" => Self::Page,
            "folder" => Self::Folder,
            "space" => Self::Space,
            "database" => Self::Database,
            "whiteboard" => Self::Whiteboard,
            "embed" => Self::Embed,
            _ => Self::Other,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Page => "page",
            Self::Folder => "folder",
            Self::Space => "space",
            Self::Database => "database",
            Self::Whiteboard => "whiteboard",
            Self::Embed => "embed",
            Self::Other => "item",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub title: String,
    pub kind: Kind,
    pub space_key: String,
    pub url: String,
}

pub(super) fn webui(value: &Value) -> &str {
    value
        .pointer("/_links/webui")
        .and_then(Value::as_str)
        .unwrap_or_default()
}
