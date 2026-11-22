use serde::{Deserialize, Serialize};

use super::{
    connector::{api_path, field, valid_id, webui, Connector, Kind, Node},
    error::ConfluenceError,
    http::Transport,
    spaces::{Space, LIMIT, TREE_TTL},
};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Children {
    pub nodes: Vec<Node>,
    pub cursor: Option<String>,
}

impl<T: Transport> Connector<T> {
    pub fn children(
        &self,
        space: &Space,
        parent: Option<(&str, Kind)>,
        cursor: Option<&str>,
        refresh: bool,
    ) -> Result<Children, ConfluenceError> {
        let path = match parent {
            Some((id, Kind::Page)) if valid_id(id) => {
                format!("/wiki/api/v2/pages/{id}/direct-children")
            }
            Some((id, Kind::Folder)) if valid_id(id) => {
                format!("/wiki/api/v2/folders/{id}/direct-children")
            }
            Some(_) => return Err(ConfluenceError::NotFound),
            None => match &space.homepage_id {
                Some(id) if valid_id(id) => format!("/wiki/api/v2/pages/{id}/direct-children"),
                _ if valid_id(&space.id) => format!("/wiki/api/v2/spaces/{}/pages", space.id),
                _ => return Err(ConfluenceError::NotFound),
            },
        };

        let mut query = vec![("limit", LIMIT)];
        if path.ends_with("/pages") {
            query.push(("depth", "root"));
        }
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor));
        }

        let path = api_path(&path, &query);
        let key = format!("{}:{path}", space.key);
        if !refresh {
            if let Some(children) = self.cache.read("tree", &key, Some(TREE_TTL)) {
                return Ok(children);
            }
        }

        match self.collection(&path) {
            Ok((rows, cursor)) => {
                let nodes = rows
                    .into_iter()
                    .filter_map(|row| {
                        let id = field(&row, "id");
                        if !valid_id(&id) {
                            return None;
                        }
                        let kind = Kind::parse(&field(&row, "type"));
                        let fallback = match kind {
                            Kind::Page => format!("/wiki/spaces/{}/pages/{id}", space.key),
                            Kind::Folder => format!("/wiki/spaces/{}/folder/{id}", space.key),
                            _ => format!("/wiki/spaces/{}/{}/{id}", space.key, kind.label()),
                        };
                        Some(Node {
                            url: self.url(webui(&row), &fallback),
                            id,
                            title: field(&row, "title"),
                            kind,
                            space_key: space.key.clone(),
                        })
                    })
                    .collect();
                let result = Children { nodes, cursor };
                self.cache.write("tree", &key, &result).ok();
                Ok(result)
            }
            Err(ConfluenceError::Offline) => self
                .cache
                .read("tree", &key, None)
                .ok_or(ConfluenceError::Offline),
            Err(error) => Err(error),
        }
    }
}
