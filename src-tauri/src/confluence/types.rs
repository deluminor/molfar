use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceStatus {
    pub connected: bool,
    pub site: String,
    pub email: String,
}

#[derive(Deserialize, Clone)]
pub(super) struct AtlassianConfig {
    pub(super) site: String,
    pub(super) email: String,
    pub(super) token: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceSpace {
    pub id: String,
    pub key: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceNode {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub space_id: String,
    pub space_key: String,
    pub parent_id: String,
    pub url: String,
    pub has_children: bool,
    pub readable: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePage {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub space_id: String,
    pub space_key: String,
    pub parent_id: String,
    pub url: String,
    pub body: String,
    pub readable: bool,
    pub truncated: bool,
}

#[derive(Debug)]
pub(super) struct HttpError {
    pub(super) status: Option<u16>,
    pub(super) message: String,
}

impl HttpError {
    pub(super) fn is_not_found(&self) -> bool {
        matches!(self.status, Some(404)) || self.message.to_ascii_lowercase().contains("not found")
    }
}
