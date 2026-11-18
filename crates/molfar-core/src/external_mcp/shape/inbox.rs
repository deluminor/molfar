use super::page;
use crate::inbox::{Comment, Details, Diff, Item, Thread};
use serde_json::{json, Value};

pub fn item(item: &Item) -> Value {
    json!({
        "key":item.key(),"provider":item.provider,"kind":item.kind,"reference":item.reference(),
        "title":item.title,"state":item.state,"url":item_url(&item.url),"repo":item.repo,
        "updatedAt":item.updated_at,"labels":item.labels.iter().take(100).collect::<Vec<_>>(),
        "assignees":item.assignees.iter().take(100).map(|person| &person.login).collect::<Vec<_>>(),
        "attentionReason":item.attention_reason,
    })
}

pub fn details(
    details: Details,
    max_chars: Option<usize>,
    offset: Option<usize>,
) -> Result<Value, String> {
    let (body, next) = page::text(&details.body, max_chars, offset)?;
    Ok(json!({
        "body":body,"nextCharOffset":next,"author":details.author,
        "baseRefName":details.base_ref_name,"headRefName":details.head_ref_name,
        "reviewDecision":details.review_decision,
    }))
}

pub fn thread(source: Thread, input: &super::super::tools::inbox::Thread) -> Result<Value, String> {
    let mut comments = Vec::new();
    collect_comments(&source.comments, None, &mut comments);
    let comment_count = comments.len();
    let offset = input.offset.unwrap_or_default();
    let limit = input.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err("List limit must be between 1 and 100.".into());
    }

    let mut entries = Vec::new();
    for (comment, parent) in comments.into_iter().skip(offset).take(limit) {
        let (body, next) = page::text(&comment.body, input.max_chars, input.char_offset)?;
        entries.push(json!({
            "type":"comment","id":comment.id,"parentId":parent,"kind":comment.kind,
            "author":comment.author,"body":body,"nextCharOffset":next,"createdAt":comment.created_at,
            "url":item_url(&comment.url),"state":comment.state,"path":comment.path,"line":comment.line,
            "resolved":comment.resolved,"threadId":comment.thread_id,
        }));
    }
    let commit_offset = offset.saturating_sub(comment_count);
    let available = limit.saturating_sub(entries.len());
    entries.extend(
        source
            .commits
            .iter()
            .skip(commit_offset)
            .take(available)
            .map(|commit| {
                json!({
                    "type":"commit","oid":commit.oid,"headline":commit.message_headline,
                    "author":commit.author,"date":commit.committed_date,"url":item_url(&commit.url),
                })
            }),
    );
    let next = (offset.saturating_add(entries.len()) < comment_count + source.commits.len())
        .then_some(offset.saturating_add(entries.len()));
    Ok(json!({
        "entries":entries,"nextOffset":next,"truncated":source.truncated,
        "reviewDecision":source.review_decision,"baseRefName":source.base_ref_name,"headRefName":source.head_ref_name,
    }))
}

fn collect_comments<'a>(
    comments: &'a [Comment],
    parent: Option<&'a str>,
    entries: &mut Vec<(&'a Comment, Option<&'a str>)>,
) {
    for comment in comments {
        entries.push((comment, parent));
        collect_comments(&comment.replies, Some(&comment.id), entries);
    }
}

pub fn diff(diff: Diff, max_chars: Option<usize>, offset: Option<usize>) -> Result<Value, String> {
    let (patch, next) = page::text(&diff.patch, max_chars, offset)?;
    Ok(json!({
        "patch":patch,"nextCharOffset":next,"additions":diff.additions,"deletions":diff.deletions,
        "files":diff.files.iter().take(100).collect::<Vec<_>>(),
        "truncated":diff.truncated || diff.files.len() > 100,
    }))
}

fn item_url(value: &str) -> Option<String> {
    let mut url = url::Url::parse(value).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    url.set_username("").ok()?;
    url.set_password(None).ok()?;
    url.set_query(None);
    Some(url.into())
}

pub fn safe_item_key(item: &Item) -> bool {
    let key = item.key();
    key.split_once(':').is_some_and(|(_, identity)| {
        !identity.contains("://")
            || url::Url::parse(identity).is_ok_and(|url| {
                url.username().is_empty() && url.password().is_none() && url.query().is_none()
            })
    })
}
