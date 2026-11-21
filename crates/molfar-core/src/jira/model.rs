use serde::{Deserialize, Serialize};

use crate::atlassian::Error;

pub const PAGE_SIZE: usize = 50;
pub const ROW_CAP: usize = 500;
pub const JQL_LIMIT: usize = 2000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum GroupBy {
    Epic,
    Status,
}

impl Default for GroupBy {
    fn default() -> Self {
        Self::Epic
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Filter {
    AssignedToMe,
    ReportedByMe,
    Watched,
    CurrentSprint,
    Saved { name: String, jql: String },
    Jql(String),
}

impl Filter {
    pub fn jql(&self) -> &str {
        match self {
            Self::AssignedToMe => "assignee = currentUser()",
            Self::ReportedByMe => "reporter = currentUser()",
            Self::Watched => "watcher = currentUser()",
            Self::CurrentSprint => "sprint in openSprints()",
            Self::Saved { jql, .. } | Self::Jql(jql) => jql,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Row {
    pub key: String,
    pub type_name: String,
    pub summary: String,
    pub status: String,
    pub priority: String,
    pub assignee: String,
    pub sprint: String,
    pub updated: String,
    pub epic_key: String,
    pub epic_summary: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Group {
    pub title: String,
    pub indexes: Vec<usize>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ListModel {
    pub rows: Vec<Row>,
    pub error: Option<String>,
    pub offline: bool,
    pub unauthorized: bool,
    pub rate_limited: bool,
    pub next: Option<String>,
    /// Token for the page after the 500-row stop. Load more uses it.
    pub more: Option<String>,
    pub capped: bool,
    pub group_by: GroupBy,
}

pub fn issue_key(key: &str) -> Result<&str, Error> {
    let key = key.trim();
    let valid = !key.is_empty()
        && key.len() < 64
        && key
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'));
    if valid {
        Ok(key)
    } else {
        Err(Error::Invalid("Missing Jira issue".into()))
    }
}

pub fn parent_jql(key: &str) -> Result<String, Error> {
    Ok(format!("parent = {}", issue_key(key)?))
}

pub fn check_jql_length(jql: &str) -> Result<(), Error> {
    if jql.chars().count() > JQL_LIMIT {
        Err(Error::Invalid("JQL is longer than 2000 characters".into()))
    } else {
        Ok(())
    }
}

pub fn groups(rows: &[Row], by: GroupBy) -> Vec<Group> {
    let mut groups = Vec::<Group>::new();
    for (index, row) in rows.iter().enumerate() {
        let title = match by {
            GroupBy::Epic if row.epic_key.is_empty() && row.epic_summary.is_empty() => {
                "No epic".to_string()
            }
            GroupBy::Epic if row.epic_summary.is_empty() => row.epic_key.clone(),
            GroupBy::Epic => format!("{} {}", row.epic_key, row.epic_summary),
            GroupBy::Status if row.status.is_empty() => "No status".to_string(),
            GroupBy::Status => row.status.clone(),
        };
        if let Some(group) = groups.iter_mut().find(|group| group.title == title) {
            group.indexes.push(index);
        } else {
            groups.push(Group {
                title,
                indexes: vec![index],
            });
        }
    }
    groups
}

pub fn append(model: &mut ListModel, rows: Vec<Row>, next: Option<String>) {
    let room = ROW_CAP.saturating_sub(model.rows.len());
    let capped = rows.len() > room || (model.rows.len() + rows.len() == ROW_CAP && next.is_some());
    model.rows.extend(rows.into_iter().take(room));
    model.capped = model.rows.len() >= ROW_CAP;
    if model.capped || capped && model.rows.len() >= ROW_CAP {
        model.more = next.or(model.more.clone());
        model.next = None;
    } else {
        model.next = next;
        model.more = None;
    }
    model.error = None;
    model.offline = false;
    model.unauthorized = false;
    model.rate_limited = false;
}

pub fn keep_rows_on_invalid(model: &mut ListModel, message: String) {
    model.error = Some(message);
}

pub fn show_error(model: &mut ListModel, error: &Error) {
    model.offline = matches!(error, Error::Offline(_));
    model.unauthorized = matches!(error, Error::Unauthorized);
    model.rate_limited = matches!(error, Error::RateLimited);
    model.error = Some(error.to_string());
}
