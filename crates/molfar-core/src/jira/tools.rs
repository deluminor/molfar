use serde_json::{json, Value};

use crate::{
    atlassian::{Client, Error},
    external_mcp::{
        grants::types::{ACCESS, RESOURCE},
        receipts::{self, ReceiptTarget, BEGIN},
        types::AuditEntry,
    },
    store::Store,
};

use super::{issue, issue_key, Filter, Page};

const DEFAULT_FIELDS: &[&str] = &[
    "summary",
    "description",
    "status",
    "issuetype",
    "priority",
    "labels",
    "assignee",
    "reporter",
    "created",
    "updated",
    "resolution",
    "project",
];

pub fn request_id(value: &str) -> Result<&str, String> {
    let id = value.trim();
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("request ID must use letters, digits, underscores or hyphens".into());
    }
    Ok(id)
}

pub fn projects(client: &Client) -> Result<Value, Error> {
    Ok(json!({"projects": super::projects(client)?}))
}

pub fn list(
    client: &Client,
    assigned_to_me: bool,
    state: Option<&str>,
    projects: &[String],
    limit: usize,
) -> Result<Value, Error> {
    let limit = limit.clamp(1, 100);
    let mut parts = Vec::new();
    if assigned_to_me {
        parts.push("assignee = currentUser()".to_string());
    }
    if let Some(state) = state.filter(|state| !state.is_empty()) {
        parts.push(format!("status = \"{}\"", state.replace('"', "")));
    }
    if !projects.is_empty() {
        let keys: Result<Vec<_>, _> = projects
            .iter()
            .map(|key| issue_key(key).map(str::to_owned))
            .collect();
        parts.push(format!("project in ({})", keys?.join(",")));
    }
    let jql = if parts.is_empty() {
        "updated >= -30d ORDER BY updated DESC".to_string()
    } else {
        parts.join(" AND ")
    };
    let page = super::search(client, &Filter::Jql(jql), None, None)?;
    Ok(page_value(page, limit))
}

pub fn search(
    client: &Client,
    jql: &str,
    max_results: usize,
    fields: Option<&[String]>,
) -> Result<Value, Error> {
    let max_results = max_results.clamp(1, 100);
    let _ = fields;
    let page = super::search(client, &Filter::Jql(jql.to_owned()), None, None)?;
    Ok(page_value(page, max_results))
}

pub fn get(client: &Client, key: &str, fields: Option<&[String]>) -> Result<Value, Error> {
    let issue = issue::load(client, key, None)?;
    let selected = fields.unwrap_or(&[]);
    let all = selected.iter().any(|field| field == "*all") || selected.is_empty();
    let wanted = if all {
        DEFAULT_FIELDS
            .iter()
            .map(|field| (*field).to_string())
            .collect()
    } else {
        selected.to_vec()
    };
    let mut object = serde_json::Map::new();
    object.insert("key".into(), json!(issue.key));
    for field in wanted {
        let value = match field.as_str() {
            "summary" => json!(issue.summary),
            "description" => json!(issue.description),
            "status" => json!(issue.status),
            "issuetype" => json!(issue.type_name),
            "priority" => json!(issue.priority),
            "labels" => json!(issue.labels),
            "assignee" => json!(issue.assignee),
            "reporter" => json!(issue.reporter),
            "created" => json!(issue.created),
            "updated" => json!(issue.updated),
            "resolution" => json!(issue.resolution),
            "project" => json!(issue.key.split('-').next().unwrap_or("")),
            _ => continue,
        };
        object.insert(field, value);
    }
    Ok(Value::Object(object))
}

pub fn thread(client: &Client, key: &str, char_offset: usize) -> Result<Value, Error> {
    let issue = issue::load(client, key, None)?;
    let text = issue
        .comments
        .iter()
        .map(|comment| format!("{}\n{}", comment.author, comment.body))
        .collect::<Vec<_>>()
        .join("\n\n");
    Ok(page_text(&text, char_offset))
}

pub fn guarded_write(
    store: &Store,
    actor: &str,
    action: &str,
    target: &str,
    raw_request_id: &str,
    arguments: &Value,
    call: impl FnOnce() -> Result<Value, String>,
) -> Result<Value, String> {
    let request_id = request_id(raw_request_id)?.to_owned();
    let digest = receipts::digest(action, arguments);
    let receipt_target = ReceiptTarget::Resource {
        kind: RESOURCE::InboxProvider,
        id: format!("jira:{target}"),
    };
    let begun =
        store.external_receipt_begin(actor, &receipt_target, action, &request_id, &digest)?;
    let result = match begun {
        BEGIN::Replay(result) => result,
        BEGIN::Conflict => Err("Request ID was already used with different input".into()),
        BEGIN::Pending => Err("outcome unknown".into()),
        BEGIN::Fresh => {
            let result = call();
            store.external_receipt_finish(
                actor,
                &receipt_target,
                action,
                &request_id,
                &digest,
                &result,
            )?;
            result
        }
    };
    let outcome = match &result {
        Ok(_) => "ok",
        Err(error) if error == "outcome unknown" => "unknown",
        Err(_) => "error",
    };
    store.external_audit(AuditEntry {
        at: crate::time::now_ms() as i64,
        client_id: actor.into(),
        action: action.into(),
        target: Some(target.into()),
        request_id: Some(request_id),
        outcome: outcome.into(),
        kind: ACCESS::Delegated,
    })?;
    result
}

pub fn execute(client: &Client, action: &str, arguments: &Value) -> Result<Value, String> {
    let leaf = action.rsplit(['.', '_']).next().unwrap_or(action);
    let key = arguments["issueKey"].as_str().unwrap_or("");
    match leaf {
        "projects" => projects(client).map_err(|error| error.to_string()),
        "list" => list(
            client,
            arguments["assignedToMe"].as_bool().unwrap_or(false),
            arguments["state"].as_str(),
            &arguments["projectIds"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_owned))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
            arguments["limit"].as_u64().unwrap_or(30) as usize,
        )
        .map_err(|error| error.to_string()),
        "search" => search(
            client,
            arguments["jql"].as_str().unwrap_or(""),
            arguments["maxResults"].as_u64().unwrap_or(50) as usize,
            None,
        )
        .map_err(|error| error.to_string()),
        "get" => get(client, key, None).map_err(|error| error.to_string()),
        "thread" => thread(
            client,
            key,
            arguments["charOffset"].as_u64().unwrap_or(0) as usize,
        )
        .map_err(|error| error.to_string()),
        "comment" => issue::comment(client, key, arguments["body"].as_str().unwrap_or(""))
            .map(|()| json!({"key": key, "posted": true}))
            .map_err(|error| error.to_string()),
        "create" => client
            .post(
                "/rest/api/3/issue",
                &json!({
                    "fields": {
                        "project": {"key": arguments["projectKey"].as_str().unwrap_or("")},
                        "summary": arguments["summary"].as_str().unwrap_or(""),
                        "description": crate::atlassian::adf::from_markdown(arguments["description"].as_str().unwrap_or("")),
                        "issuetype": {"name": "Task"}
                    }
                }),
            )
            .map(|value| json!({"key": value["key"].as_str().unwrap_or("")}))
            .map_err(|error| error.to_string()),
        "edit" => issue::edit(
            client,
            key,
            arguments["summary"].as_str().unwrap_or(""),
            arguments["description"].as_str().unwrap_or(""),
            &arguments["labels"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_owned))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),
        )
        .map(|()| json!({"key": key, "edited": true}))
        .map_err(|error| error.to_string()),
        "transitions" => issue::transitions(client, key)
            .map(|items| {
                json!({"transitions": items.into_iter().map(|item| json!({"id": item.id, "name": item.name})).collect::<Vec<_>>()})
            })
            .map_err(|error| error.to_string()),
        "transition" => issue::transition(
            client,
            key,
            arguments["transitionId"].as_str().unwrap_or(""),
        )
        .map(|()| json!({"key": key, "transitioned": true}))
        .map_err(|error| error.to_string()),
        _ => Err("Unknown Jira action".into()),
    }
}

fn page_value(page: Page, limit: usize) -> Value {
    json!({
        "issues": page.rows.into_iter().take(limit).map(|row| json!({
            "key": row.key,
            "type": row.type_name,
            "summary": row.summary,
            "status": row.status,
            "priority": row.priority,
            "assignee": row.assignee,
            "sprint": row.sprint,
            "updated": row.updated,
        })).collect::<Vec<_>>(),
        "nextPageToken": page.next,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pending_receipt_reports_outcome_unknown_and_replay_skips_the_call() {
        let store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let marker = "comment-marker-9f3a";
        let arguments = json!({"body": marker, "requestId": "write-1"});
        let mut calls = 0;
        let first = guarded_write(
            &store,
            "operator",
            "jira.comment",
            "TB-1",
            "write-1",
            &arguments,
            || {
                calls += 1;
                Ok(json!({"posted": true}))
            },
        )
        .unwrap();
        assert_eq!(first["posted"], true);
        assert_eq!(calls, 1);

        let replay = guarded_write(
            &store,
            "operator",
            "jira.comment",
            "TB-1",
            "write-1",
            &arguments,
            || {
                calls += 1;
                Ok(json!({"posted": true}))
            },
        )
        .unwrap();
        assert_eq!(replay, first);
        assert_eq!(calls, 1);

        let conflict = guarded_write(
            &store,
            "operator",
            "jira.comment",
            "TB-1",
            "write-1",
            &json!({"body": "other", "requestId": "write-1"}),
            || {
                calls += 1;
                Ok(json!({}))
            },
        );
        assert!(conflict.unwrap_err().contains("different input"));
        assert_eq!(calls, 1);

        let pending_arguments = json!({"body": marker});
        let digest = receipts::digest("jira.comment", &pending_arguments);
        let target = ReceiptTarget::Resource {
            kind: RESOURCE::InboxProvider,
            id: "jira:TB-2".into(),
        };
        store
            .external_receipt_begin("operator", &target, "jira.comment", "pending-1", &digest)
            .unwrap();
        let pending = guarded_write(
            &store,
            "operator",
            "jira.comment",
            "TB-2",
            "pending-1",
            &pending_arguments,
            || {
                calls += 1;
                Ok(json!({}))
            },
        );
        assert!(pending.unwrap_err().contains("outcome unknown"));
        assert_eq!(calls, 1);
        let audit = serde_json::to_string(&store.external_audit_log().unwrap()).unwrap();
        assert!(!audit.contains(marker));
        assert!(audit.contains("TB-1"));
    }
}

fn page_text(text: &str, offset: usize) -> Value {
    let start = offset.min(text.len());
    let end = (start + 6000).min(text.len());
    json!({
        "text": &text[start..end],
        "nextCharOffset": (end < text.len()).then_some(end),
    })
}
