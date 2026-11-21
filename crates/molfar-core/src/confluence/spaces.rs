use std::{collections::HashSet, time::Duration};

use serde::{Deserialize, Serialize};

use super::{
    connector::{api_path, field, valid_id, Connector},
    error::ConfluenceError,
    http::Transport,
};

pub(super) const TREE_TTL: Duration = Duration::from_secs(300);
pub(super) const LIMIT: &str = "50";
const MAX_SPACES: usize = 500;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Space {
    pub id: String,
    pub key: String,
    pub title: String,
    pub homepage_id: Option<String>,
    pub url: String,
}

pub fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 96
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'~'))
}

impl<T: Transport> Connector<T> {
    pub fn spaces(&self, refresh: bool) -> Result<Vec<Space>, ConfluenceError> {
        let cached = self.cache.read("tree", "spaces", None);
        if !refresh {
            if let Some(spaces) = self.cache.read("tree", "spaces", Some(TREE_TTL)) {
                return Ok(spaces);
            }
        }

        match self.fetch_spaces() {
            Ok(spaces) => {
                self.cache.write("tree", "spaces", &spaces).ok();
                Ok(spaces)
            }
            Err(ConfluenceError::Offline) => cached.ok_or(ConfluenceError::Offline),
            Err(error) => Err(error),
        }
    }

    pub fn visible_spaces(
        &self,
        hidden: &HashSet<String>,
        refresh: bool,
    ) -> Result<Vec<Space>, ConfluenceError> {
        let mut spaces = self.spaces(refresh)?;
        spaces.retain(|space| !hidden.contains(&space.id));
        Ok(spaces)
    }

    fn fetch_spaces(&self) -> Result<Vec<Space>, ConfluenceError> {
        let mut spaces = Vec::new();
        let mut cursor = String::new();
        let mut seen = HashSet::new();
        for _ in 0..(MAX_SPACES / 50) {
            let mut query = vec![("limit", LIMIT), ("status", "current")];
            if !cursor.is_empty() {
                query.push(("cursor", &cursor));
            }
            let (results, next) = self.collection(&api_path("/wiki/api/v2/spaces", &query))?;
            for row in results {
                let id = field(&row, "id");
                let key = field(&row, "key");
                if valid_id(&id) && valid_key(&key) && seen.insert(id.clone()) {
                    let homepage = field(&row, "homepageId");
                    spaces.push(Space {
                        url: self.url("", &format!("/wiki/spaces/{key}")),
                        id,
                        key,
                        title: field(&row, "name"),
                        homepage_id: valid_id(&homepage).then_some(homepage),
                    });
                }
            }

            let Some(next) = next.filter(|next| next != &cursor) else {
                break;
            };
            cursor = next;
        }

        spaces.truncate(MAX_SPACES);
        Ok(spaces)
    }
}
