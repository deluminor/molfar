//! Jira issue IO and attachment caching, run off the UI thread.
use std::path::{Path, PathBuf};

use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Issue, issue::Comment},
};

use super::media::description_preview;
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

pub(super) fn load(app: &Path, key: &str) -> Result<Loaded, atlassian::Error> {
    let (site, mut issue, account, media) = fetch(app, key)?;
    let description = description_preview(&issue, &media);
    jira::issue::sort_comments(&mut issue.comments, false);
    let comments = issue
        .comments
        .iter()
        .map(|comment| {
            let blocks = parse_preview(&comment.body, None);
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

fn fetch(app: &Path, key: &str) -> Result<(String, Issue, String, PathBuf), atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    let sprint = jira::sprint_field(&client).ok().flatten();
    let issue = jira::issue::load(&client, key, sprint.as_deref())?;
    let account = jira::issue::account_id(&client).unwrap_or_default();
    let site = credentials.site();
    let directory = jira::media_root(app, site, credentials.email());
    let site_full = jira::site_media_full(app, site).unwrap_or(true);
    if !site_full {
        for attachment in &issue.attachments {
            let id = &attachment.id;
            if !jira::valid_media_id(id) || jira::cached_file(&directory, id).is_some() {
                continue;
            }
            match client.bytes(&format!("/rest/api/3/attachment/content/{id}")) {
                Ok(Some(bytes)) => {
                    if let Err(error) =
                        jira::store_media(app, site, credentials.email(), id, &bytes)
                    {
                        log::debug!("Could not cache Jira attachment: {error}");
                    }
                }
                Ok(None) => (),
                Err(error) => log::debug!("Could not load Jira attachment: {error}"),
            }
        }
    }
    Ok((site.to_owned(), issue, account, directory))
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
