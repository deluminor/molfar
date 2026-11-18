use super::{NOT_FOUND, backend::ExternalInbox};
use molfar_core::{
    external_mcp::{
        shape::{inbox as shape, page},
        tools::{
            inbox::{Comment, List, Read, Thread},
            parse,
        },
    },
    inbox::{Comment as InboxComment, Item, Snapshot, is_tracker},
};
use serde_json::{Value, json};
use std::path::PathBuf;

pub(super) fn empty_list(arguments: &Value) -> Result<Value, String> {
    let input: List = parse(arguments)?;
    page::list("items", [], input.limit, input.offset)
}

pub(super) fn run(
    backend: &dyn ExternalInbox,
    cached: Option<Snapshot>,
    projects: &[PathBuf],
    providers: &[&str],
    tool: &str,
    arguments: &Value,
) -> Result<Value, String> {
    let snapshot = cached.unwrap_or_else(|| backend.list(projects, providers));
    let accessible = snapshot.items.iter().filter(|item| {
        providers.contains(&item.provider.as_str())
            && shape::safe_item_key(item)
            && snapshot
                .connections
                .get(&item.provider)
                .is_some_and(|status| status.connected)
    });
    if tool == "inbox_list" {
        let input: List = parse(arguments)?;
        if accessible.clone().next().is_none()
            && providers
                .iter()
                .all(|provider| snapshot.errors.contains_key(*provider))
        {
            return Err(provider_error(tool));
        }
        return page::list(
            "items",
            accessible.map(shape::item),
            input.limit,
            input.offset,
        );
    }

    let key = arguments["itemKey"].as_str().ok_or(NOT_FOUND)?;
    let item = accessible
        .into_iter()
        .find(|item| item.key() == key)
        .ok_or(NOT_FOUND)?;
    if !backend
        .connected(&item.provider)
        .map_err(|_| provider_error(tool))?
    {
        return Err(NOT_FOUND.into());
    }

    match tool {
        "inbox_details" => {
            let input: Read = parse(arguments)?;
            let details = backend.details(item).map_err(|_| provider_error(tool))?;
            shape::details(details, input.max_chars, input.char_offset)
        }
        "inbox_thread" => {
            let input: Thread = parse(arguments)?;
            let thread = backend.thread(item).map_err(|_| provider_error(tool))?;
            shape::thread(thread, &input)
        }
        "inbox_diff" => {
            if item.kind != "pr" || is_tracker(&item.provider) {
                return Err("Diffs are available for pull and merge requests.".into());
            }
            let input: Read = parse(arguments)?;
            let diff = backend.diff(item).map_err(|_| provider_error(tool))?;
            shape::diff(diff, input.max_chars, input.char_offset)
        }
        "inbox_comment" => {
            let input: Comment = parse(arguments)?;
            comment(backend, item, input)?;
            Ok(json!({"itemKey":key,"posted":true}))
        }
        _ => Err("Unknown inbox tool.".into()),
    }
}

fn comment(backend: &dyn ExternalInbox, item: &Item, input: Comment) -> Result<(), String> {
    let reply_to = input.reply_to.unwrap_or_default();
    let reply_to = reply_to.trim();
    if !reply_to.is_empty() {
        if !matches!(item.provider.as_str(), "github" | "linear") {
            return Err("This inbox provider does not support replies.".into());
        }
        let thread = backend
            .thread(item)
            .map_err(|_| provider_error("inbox_comment"))?;
        if !contains_reply(&thread.comments, &item.provider, reply_to) {
            return Err("Reply target not found on this inbox item.".into());
        }
    }
    backend
        .comment(item, input.body, reply_to.into())
        .map_err(|_| provider_error("inbox_comment"))
}

fn contains_reply(comments: &[InboxComment], provider: &str, id: &str) -> bool {
    comments.iter().any(|comment| {
        let target = if provider == "github" {
            &comment.thread_id
        } else {
            &comment.id
        };
        target == id || contains_reply(&comment.replies, provider, id)
    })
}

fn provider_error(tool: &str) -> String {
    log::warn!("External MCP inbox provider failed during {tool}");
    "Inbox provider request failed.".into()
}
