use serde_json::{json, Value};

use super::model::{check_jql_length, issue_key, Filter, Row, PAGE_SIZE};
use crate::atlassian::{Client, Error};

const BASE_FIELDS: &[&str] = &[
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "updated",
    "parent",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Page {
    pub rows: Vec<Row>,
    pub next: Option<String>,
}

pub fn favourites(client: &Client) -> Result<Vec<Filter>, Error> {
    let data = client.get("/rest/api/3/filter/favourite")?;
    let filters = data.as_array().map(Vec::as_slice).unwrap_or_default();
    Ok(filters
        .iter()
        .filter_map(|filter| {
            let name = filter.get("name")?.as_str()?.trim();
            let jql = filter.get("jql")?.as_str()?.trim();
            if name.is_empty() || jql.is_empty() {
                return None;
            }
            check_jql_length(jql).ok()?;
            Some(Filter::Saved {
                name: name.to_string(),
                jql: jql.to_string(),
            })
        })
        .collect())
}

pub fn mention_jql(query: &str) -> Result<String, Error> {
    let safe: String = query
        .trim()
        .chars()
        .filter(|c| !c.is_control() && *c != '"' && *c != '\\')
        .take(80)
        .collect();
    if safe.is_empty() {
        return Err(Error::Invalid("Mention query is empty".into()));
    }
    let jql = if issue_key(&safe).is_ok() && safe.contains('-') {
        format!("key = {safe} OR summary ~ \"{safe}\" ORDER BY updated DESC")
    } else {
        format!("summary ~ \"{safe}\" ORDER BY updated DESC")
    };
    check_jql_length(&jql)?;
    Ok(jql)
}

pub fn epic_field(client: &Client) -> Result<Option<String>, Error> {
    let data = client.get("/rest/api/3/field")?;
    Ok(data.as_array().and_then(|fields| {
        fields.iter().find_map(|field| {
            let schema = field.pointer("/schema/custom").and_then(Value::as_str);
            let epic = schema.is_some_and(|value| value.ends_with(":gh-epic-link"))
                || field.get("name").and_then(Value::as_str) == Some("Epic Link");
            epic.then(|| field.get("id").and_then(Value::as_str).map(str::to_owned))
                .flatten()
        })
    }))
}

pub fn search(
    client: &Client,
    filter: &Filter,
    token: Option<&str>,
    sprint_field: Option<&str>,
) -> Result<Page, Error> {
    search_limited(client, filter, token, sprint_field, None, PAGE_SIZE, None)
}

pub fn search_limited(
    client: &Client,
    filter: &Filter,
    token: Option<&str>,
    sprint_field: Option<&str>,
    epic_field: Option<&str>,
    max_results: usize,
    fields: Option<&[String]>,
) -> Result<Page, Error> {
    let jql = filter.jql();
    check_jql_length(jql)?;
    let max_results = max_results.clamp(1, 100);
    let mut names: Vec<String> = if let Some(fields) = fields.filter(|fields| !fields.is_empty()) {
        fields.to_vec()
    } else {
        BASE_FIELDS
            .iter()
            .map(|field| (*field).to_string())
            .collect()
    };
    if let Some(field) = sprint_field {
        if !names.iter().any(|name| name == field) {
            names.push(field.to_string());
        }
    }
    if let Some(field) = epic_field {
        if !names.iter().any(|name| name == field) {
            names.push(field.to_string());
        }
    }
    let mut body = json!({
        "jql": jql,
        "maxResults": max_results,
        "fields": names,
    });
    if let Some(token) = token.filter(|token| !token.is_empty()) {
        body["nextPageToken"] = json!(token);
    }
    let data = client.post("/rest/api/3/search/jql", &body)?;
    Ok(Page {
        rows: issues(&data)
            .iter()
            .map(|issue| row(issue, sprint_field, epic_field))
            .collect(),
        next: data
            .get("nextPageToken")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
            .map(str::to_owned),
    })
}

pub fn validate_jql(client: &Client, jql: &str) -> Result<(), Error> {
    check_jql_length(jql)?;
    let data = client.post("/rest/api/3/jql/parse", &json!({"queries": [jql]}))?;
    if let Some(message) = parse_error(&data) {
        return Err(Error::Invalid(message));
    }
    Ok(())
}

pub fn sprint_field(client: &Client) -> Result<Option<String>, Error> {
    let data = client.get("/rest/api/3/field")?;
    Ok(data.as_array().and_then(|fields| {
        fields.iter().find_map(|field| {
            let schema = field.pointer("/schema/custom").and_then(Value::as_str);
            let sprint = schema.is_some_and(|value| value.ends_with(":gh-sprint"))
                || field.get("name").and_then(Value::as_str) == Some("Sprint");
            sprint
                .then(|| field.get("id").and_then(Value::as_str).map(str::to_owned))
                .flatten()
        })
    }))
}

pub fn projects(client: &Client) -> Result<Vec<(String, String)>, Error> {
    let mut start = 0;
    let mut projects = Vec::new();
    loop {
        let data = client.get(&format!(
            "/rest/api/3/project/search?startAt={start}&maxResults={PAGE_SIZE}"
        ))?;
        for project in data
            .get("values")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            let key = text(project, "key");
            if issue_key(&key).is_ok() {
                projects.push((key, text(project, "name")));
            }
        }
        if data.get("isLast").and_then(Value::as_bool).unwrap_or(true) {
            break;
        }
        start += PAGE_SIZE;
    }
    Ok(projects)
}

pub fn epics(
    client: &Client,
    project: &str,
    sprint_field: Option<&str>,
) -> Result<Vec<Row>, Error> {
    let project = issue_key(project)?;
    let mut page = search(
        client,
        &Filter::Jql(format!(
            "project = {project} AND issuetype = Epic ORDER BY updated DESC"
        )),
        None,
        sprint_field,
    )?;
    let mut rows = page.rows;
    while let Some(token) = page.next.clone() {
        if rows.len() >= super::model::ROW_CAP {
            break;
        }
        page = search(
            client,
            &Filter::Jql(format!("project = {project} AND issuetype = Epic")),
            Some(&token),
            sprint_field,
        )?;
        rows.extend(page.rows);
    }
    Ok(rows)
}

pub fn epic_children(
    client: &Client,
    epic: &str,
    sprint_field: Option<&str>,
) -> Result<Vec<Row>, Error> {
    let epic = issue_key(epic)?;
    match client.get(&format!(
        "/rest/agile/1.0/epic/{epic}/issue?maxResults={PAGE_SIZE}"
    )) {
        Ok(data) => Ok(issues(&data)
            .iter()
            .map(|issue| row(issue, sprint_field, None))
            .collect()),
        Err(Error::NotFound) => Ok(search(
            client,
            &Filter::Jql(super::model::parent_jql(epic)?),
            None,
            sprint_field,
        )?
        .rows),
        Err(error) => Err(error),
    }
}

fn parse_error(data: &Value) -> Option<String> {
    data.pointer("/queries/0/errors/0")
        .and_then(|value| value.as_str().or_else(|| value.get("message")?.as_str()))
        .or_else(|| data.pointer("/errors/0/message").and_then(Value::as_str))
        .filter(|message| !message.is_empty())
        .map(str::to_owned)
}

fn issues(data: &Value) -> &[Value] {
    data.get("issues")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn epic_link(fields: &Value, epic_field: Option<&str>) -> Option<(String, String)> {
    let value = fields.get(epic_field?)?;
    if let Some(key) = value.as_str().filter(|key| !key.is_empty()) {
        return Some((key.to_string(), String::new()));
    }
    let key = value.get("key").and_then(Value::as_str).unwrap_or("");
    if key.is_empty() {
        return None;
    }
    let summary = value
        .pointer("/fields/summary")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Some((key.to_string(), summary))
}

pub(crate) fn row(issue: &Value, sprint_field: Option<&str>, epic_field: Option<&str>) -> Row {
    let fields = issue.get("fields").unwrap_or(issue);
    let parent = fields.get("parent");
    let parent_type = parent
        .and_then(|parent| parent.pointer("/fields/issuetype/name"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let epic = parent_type.eq_ignore_ascii_case("epic");
    let linked = (!epic).then(|| epic_link(fields, epic_field)).flatten();
    Row {
        key: text(issue, "key"),
        type_name: named(fields, "issuetype"),
        summary: text(fields, "summary"),
        status: named(fields, "status"),
        priority: named(fields, "priority"),
        assignee: fields
            .pointer("/assignee/displayName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        sprint: sprint_field
            .and_then(|field| fields.get(field))
            .map(sprint_name)
            .unwrap_or_default(),
        updated: text(fields, "updated"),
        epic_key: if epic {
            parent
                .and_then(|parent| parent.get("key"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        } else {
            linked
                .as_ref()
                .map(|(key, _)| key.clone())
                .unwrap_or_default()
        },
        epic_summary: if epic {
            parent
                .and_then(|parent| parent.pointer("/fields/summary"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        } else {
            linked
                .as_ref()
                .map(|(_, summary)| summary.clone())
                .unwrap_or_default()
        },
    }
}

fn sprint_name(value: &Value) -> String {
    let sprint = value
        .as_array()
        .and_then(|items| items.last())
        .unwrap_or(value);
    sprint
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn named(fields: &Value, key: &str) -> String {
    fields
        .pointer(&format!("/{key}/name"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
