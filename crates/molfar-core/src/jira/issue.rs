use serde_json::{json, Value};

use super::{issue_key, query};
use crate::atlassian::{adf, Client, Error};

pub const COMMENT_LIMIT: usize = 65_536;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Linked {
    pub key: String,
    pub summary: String,
    pub status: String,
    pub relation: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub created: String,
    pub body: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Work {
    pub spent: String,
    pub original: String,
    pub remaining: String,
    pub more: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Issue {
    pub key: String,
    pub type_name: String,
    pub summary: String,
    pub status: String,
    pub priority: String,
    pub assignee: String,
    pub reporter: String,
    pub sprint: String,
    pub epic: String,
    pub labels: Vec<String>,
    pub components: Vec<String>,
    pub fix_versions: Vec<String>,
    pub created: String,
    pub updated: String,
    pub due: String,
    pub resolution: String,
    pub description: String,
    pub subtasks: Vec<Linked>,
    pub links: Vec<Linked>,
    pub attachments: Vec<Attachment>,
    pub comments: Vec<Comment>,
    pub work: Work,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transition {
    pub id: String,
    pub name: String,
}

pub fn load(client: &Client, key: &str, sprint_field: Option<&str>) -> Result<Issue, Error> {
    let key = issue_key(key)?;
    let data = client.get(&format!("/rest/api/3/issue/{key}?fields=*all"))?;
    Ok(parse(&data, sprint_field))
}

pub fn transitions(client: &Client, key: &str) -> Result<Vec<Transition>, Error> {
    let key = issue_key(key)?;
    let data = client.get(&format!("/rest/api/3/issue/{key}/transitions"))?;
    Ok(data
        .get("transitions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| Transition {
                    id: text(item, "id"),
                    name: text(item, "name"),
                })
                .filter(|item| !item.id.is_empty())
                .collect()
        })
        .unwrap_or_default())
}

pub fn comment(client: &Client, key: &str, body: &str) -> Result<(), Error> {
    let key = issue_key(key)?;
    let body = body.trim();
    if body.is_empty() {
        return Err(Error::Invalid("Comment cannot be empty".into()));
    }
    if body.len() > COMMENT_LIMIT {
        return Err(Error::Invalid("Comment is longer than 65536 bytes".into()));
    }
    client.post(
        &format!("/rest/api/3/issue/{key}/comment"),
        &json!({"body": adf::from_markdown(body)}),
    )?;
    Ok(())
}

pub fn transition(client: &Client, key: &str, id: &str) -> Result<(), Error> {
    let key = issue_key(key)?;
    if id.is_empty() || !id.chars().all(|char| char.is_ascii_alphanumeric()) {
        return Err(Error::Invalid("Choose a transition".into()));
    }
    client.post(
        &format!("/rest/api/3/issue/{key}/transitions"),
        &json!({"transition": {"id": id}}),
    )?;
    Ok(())
}

pub fn assign(client: &Client, key: &str, account_id: &str) -> Result<(), Error> {
    let key = issue_key(key)?;
    if account_id.is_empty() {
        return Err(Error::Invalid(
            "Jira did not return the current user".into(),
        ));
    }
    client.put(
        &format!("/rest/api/3/issue/{key}/assignee"),
        &json!({"accountId": account_id}),
    )?;
    Ok(())
}

pub fn edit(
    client: &Client,
    key: &str,
    summary: &str,
    description: &str,
    labels: &[String],
) -> Result<(), Error> {
    let key = issue_key(key)?;
    let summary = summary.trim();
    if summary.is_empty() {
        return Err(Error::Invalid("Summary cannot be empty".into()));
    }
    client.put(
        &format!("/rest/api/3/issue/{key}"),
        &json!({
            "fields": {
                "summary": summary,
                "description": adf::from_markdown(description),
                "labels": labels,
            }
        }),
    )?;
    Ok(())
}

pub fn account_id(client: &Client) -> Result<String, Error> {
    let myself = client.get("/rest/api/3/myself")?;
    let id = text(&myself, "accountId");
    if id.is_empty() {
        Err(Error::Invalid(
            "Jira did not return the current user".into(),
        ))
    } else {
        Ok(id)
    }
}

pub fn sort_comments(comments: &mut [Comment], newest_first: bool) {
    comments.sort_by(|left, right| {
        if newest_first {
            right.created.cmp(&left.created)
        } else {
            left.created.cmp(&right.created)
        }
    });
}

pub fn parse(issue: &Value, sprint_field: Option<&str>) -> Issue {
    let row = query::row(issue, sprint_field);
    let fields = issue.get("fields").unwrap_or(issue);
    Issue {
        key: row.key,
        type_name: row.type_name,
        summary: row.summary,
        status: row.status,
        priority: row.priority,
        assignee: row.assignee,
        reporter: fields
            .pointer("/reporter/displayName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        sprint: row.sprint,
        epic: if row.epic_key.is_empty() {
            String::new()
        } else {
            format!("{} {}", row.epic_key, row.epic_summary)
        },
        labels: strings(fields.get("labels")),
        components: names(fields.get("components")),
        fix_versions: names(fields.get("fixVersions")),
        created: text(fields, "created"),
        updated: row.updated,
        due: text(fields, "duedate"),
        resolution: fields
            .pointer("/resolution/name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        description: adf::to_markdown(fields.get("description").unwrap_or(&Value::Null)),
        subtasks: linked(fields.get("subtasks"), "subtask"),
        links: issue_links(fields.get("issuelinks")),
        attachments: fields
            .get("attachment")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|item| Attachment {
                        id: text(item, "id"),
                        name: text(item, "filename"),
                        size: item.get("size").and_then(Value::as_u64).unwrap_or(0),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        comments: fields
            .pointer("/comment/comments")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|item| Comment {
                        id: text(item, "id"),
                        author: item
                            .pointer("/author/displayName")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .into(),
                        created: text(item, "created"),
                        body: adf::to_markdown(item.get("body").unwrap_or(&Value::Null)),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        work: Work {
            spent: fields
                .pointer("/timetracking/timeSpent")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            original: fields
                .pointer("/timetracking/originalEstimate")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            remaining: fields
                .pointer("/timetracking/remainingEstimate")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .into(),
            more: fields
                .pointer("/worklog/total")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .saturating_sub(
                    fields
                        .pointer("/worklog/maxResults")
                        .and_then(Value::as_u64)
                        .unwrap_or(0),
                ),
        },
    }
}

fn linked(value: Option<&Value>, relation: &str) -> Vec<Linked> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| Linked {
                    key: text(item, "key"),
                    summary: item
                        .pointer("/fields/summary")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .into(),
                    status: item
                        .pointer("/fields/status/name")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .into(),
                    relation: relation.into(),
                })
                .filter(|item| !item.key.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn issue_links(value: Option<&Value>) -> Vec<Linked> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let relation = item
                        .pointer("/type/outward")
                        .and_then(Value::as_str)
                        .unwrap_or("relates");
                    let (other, relation) = if item.get("outwardIssue").is_some() {
                        (item.get("outwardIssue"), relation)
                    } else {
                        (
                            item.get("inwardIssue"),
                            item.pointer("/type/inward")
                                .and_then(Value::as_str)
                                .unwrap_or(relation),
                        )
                    };
                    other.map(|issue| {
                        let mut linked = linked(Some(&Value::Array(vec![issue.clone()])), relation);
                        linked.pop().unwrap_or_default()
                    })
                })
                .filter(|item| !item.key.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn names(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str).map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
