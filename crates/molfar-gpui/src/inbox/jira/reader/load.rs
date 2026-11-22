//! Jira issue IO and attachment rewriting, run off the UI thread.
use std::path::{Path, PathBuf};

use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Issue, issue::Comment},
};

use crate::{
    inbox::jira::actions::Pending,
    knowledge::{PreviewBlock, parse_preview},
};

/// An issue with its Markdown parsed once, off the UI thread.
pub(super) struct Loaded {
    pub site: String,
    pub issue: Issue,
    pub account: String,
    pub media: PathBuf,
    pub description: Vec<PreviewBlock>,
    pub comments: Vec<(Comment, Vec<PreviewBlock>)>,
}

pub(super) fn media_root(app: &Path, site: &str) -> PathBuf {
    app.join("jira-cache")
        .join(jira::link::host_of(site))
        .join("media")
}

pub(super) fn load(app: &Path, key: &str) -> Result<Loaded, atlassian::Error> {
    let (site, mut issue, account) = fetch(app, key)?;
    let media = media_root(app, &site);
    let description = parse_preview(&shown_markdown(&issue, &media), Some(&media));
    jira::issue::sort_comments(&mut issue.comments, false);
    let comments = issue
        .comments
        .iter()
        .map(|comment| {
            let blocks = parse_preview(&comment.body, Some(&media));
            (comment.clone(), blocks)
        })
        .collect();
    Ok(Loaded {
        site,
        issue,
        account,
        media,
        description,
        comments,
    })
}

fn fetch(app: &Path, key: &str) -> Result<(String, Issue, String), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    let sprint = jira::sprint_field(&client).ok().flatten();
    let issue = jira::issue::load(&client, key, sprint.as_deref())?;
    let account = jira::issue::account_id(&client).unwrap_or_default();
    let site_full = jira::site_media_full(app, credentials.site()).unwrap_or(true);
    if !site_full {
        for attachment in &issue.attachments {
            if let Ok(Some(bytes)) =
                client.bytes(&format!("/rest/api/3/attachment/content/{}", attachment.id))
            {
                let _ = jira::store_media(app, credentials.site(), &attachment.id, &bytes);
            }
        }
    }
    Ok((credentials.site().to_string(), issue, account))
}

pub(super) fn write_pending(
    app: &Path,
    pending: &Pending,
    account: &str,
) -> Result<(), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    match pending {
        Pending::Comment { key, body } => jira::issue::comment(&client, key, body),
        Pending::Transition { key, id, .. } => jira::issue::transition(&client, key, id),
        Pending::Assign { key } => jira::issue::assign(&client, key, account),
        Pending::Edit {
            key,
            summary,
            description,
            labels,
        } => jira::issue::edit(
            &client,
            key,
            Some(summary),
            description.as_deref(),
            Some(labels),
        ),
    }
}

fn shown_markdown(issue: &Issue, media_root: &Path) -> String {
    let mut markdown = issue.description.clone();
    for attachment in &issue.attachments {
        let token = format!("attachment://{}", attachment.id);
        let file = media_root.join(&attachment.id);
        let replacement = if file.is_file() {
            format!("molfar-asset:{}", attachment.id)
        } else {
            attachment.name.clone()
        };
        markdown = markdown.replace(&token, &replacement);
    }
    markdown
}
