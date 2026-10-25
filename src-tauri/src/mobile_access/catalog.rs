//! Merges each window's catalog and picks which window owns a request.

use super::*;

pub(super) fn merged_catalog(app: &AppHandle, inner: &mut Inner) -> Value {
    inner
        .catalogs
        .retain(|window, _| app.get_webview_window(window).is_some());
    let mut result = json!({"projects":[],"familiars":[],"sessions":[]});
    for field in ["projects", "familiars", "sessions"] {
        let mut items = HashMap::new();
        for catalog in inner.catalogs.values() {
            for item in catalog[field].as_array().into_iter().flatten() {
                if let Some(id) = item["id"].as_str() {
                    let rank = |value: &Value| {
                        (
                            value["busy"] == true,
                            value["live"] == true,
                            value["updatedAt"].as_u64(),
                        )
                    };
                    if items
                        .get(id)
                        .is_none_or(|previous| rank(item) > rank(previous))
                    {
                        items.insert(id.to_owned(), item.clone());
                    }
                }
            }
        }
        let mut items: Vec<_> = items.into_values().collect();
        items.sort_by(|a, b| {
            if field == "sessions" {
                return b["updatedAt"].as_u64().cmp(&a["updatedAt"].as_u64());
            }
            a["name"]
                .as_str()
                .unwrap_or("")
                .cmp(b["name"].as_str().unwrap_or(""))
        });
        result[field] = json!(items);
    }
    result
}
/// How many of a project's sessions the workspace poll carries; the sessions
/// sheet pages through the rest with `sessions.list`.
pub(super) const RECENT_SESSIONS: usize = 20;
pub(super) const SESSION_PAGE_MAX: usize = 100;

/// The workspace poll's sessions: each project's most recent, every busy one,
/// and every Familiar's. `sessions` is newest first, as `merged_catalog` sorts it.
pub(super) fn recent_sessions(sessions: &Value) -> Vec<Value> {
    let mut per_project: HashMap<&str, usize> = HashMap::new();
    sessions
        .as_array()
        .into_iter()
        .flatten()
        .filter(|session| {
            let count = per_project
                .entry(session["projectId"].as_str().unwrap_or(""))
                .or_default();
            *count += 1;
            *count <= RECENT_SESSIONS
                || session["busy"] == true
                || session["familiarId"].is_string()
        })
        .cloned()
        .collect()
}

/// One page of a project's sessions, newest first, optionally matching a query
/// against title, model and branch.
pub(super) fn session_page(sessions: &Value, params: &Value) -> Value {
    let project = params["projectId"].as_str().unwrap_or("");
    let query = params["query"].as_str().unwrap_or("").trim().to_lowercase();
    let offset = params["offset"].as_u64().unwrap_or(0) as usize;
    let limit = (params["limit"].as_u64().unwrap_or(30) as usize).clamp(1, SESSION_PAGE_MAX);
    // The Sessions screen's filters: active since a time, and providers left out.
    let since = params["since"].as_f64().unwrap_or(0.0);
    let hidden: Vec<&str> = params["hiddenHarnesses"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let matches: Vec<&Value> = sessions
        .as_array()
        .into_iter()
        .flatten()
        .filter(|session| session["projectId"] == project)
        .filter(|session| since <= 0.0 || session["updatedAt"].as_f64().unwrap_or(0.0) >= since)
        .filter(|session| {
            !session["harness"]
                .as_str()
                .is_some_and(|harness| hidden.contains(&harness))
        })
        .filter(|session| {
            query.is_empty()
                || ["title", "model", "branch"].iter().any(|field| {
                    session[*field]
                        .as_str()
                        .is_some_and(|value| value.to_lowercase().contains(&query))
                })
        })
        .collect();
    let page: Vec<&Value> = matches.iter().skip(offset).take(limit).copied().collect();
    json!({
        "sessions": page,
        "hasMore": offset + page.len() < matches.len(),
    })
}

pub(super) fn pick_owner(
    catalogs: &HashMap<String, Value>,
    method: &str,
    entity: &str,
) -> Option<String> {
    catalogs
        .iter()
        .filter_map(|(window, catalog)| {
            let (field, id) = if method == "session.start" || method == "project.changes" {
                ("projects", entity)
            } else if let Some(familiar) = entity.strip_prefix("familiar:") {
                ("familiars", familiar)
            } else {
                ("sessions", entity)
            };
            catalog[field]
                .as_array()?
                .iter()
                .find(|item| item["id"] == id)
                .map(|item| {
                    let rank = if item["busy"] == true {
                        3
                    } else if item["live"] == true {
                        2
                    } else {
                        1
                    };
                    (window, rank)
                })
        })
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(window, _)| window.clone())
}
