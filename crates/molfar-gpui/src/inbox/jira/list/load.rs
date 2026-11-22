//! Jira list IO, run on the background executor.
use std::path::{Path, PathBuf};

use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Filter, ListModel},
};

pub(super) enum Load {
    Page(ListModel, Vec<Filter>),
    Invalid(String),
}

pub(super) fn client_for(app: &Path) -> Result<Client, atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    Ok(Client::new(&credentials))
}

pub(super) fn project_rows(app: &Path) -> Result<Vec<jira::Row>, atlassian::Error> {
    let client = client_for(app)?;
    Ok(jira::projects(&client)?
        .into_iter()
        .map(|(key, name)| jira::Row {
            key,
            summary: name,
            type_name: "Project".into(),
            ..jira::Row::default()
        })
        .collect())
}

pub(super) fn epic_rows(app: &Path, project: &str) -> Result<Vec<jira::Row>, atlassian::Error> {
    let client = client_for(app)?;
    let sprint = jira::sprint_field(&client).ok().flatten();
    jira::epics(&client, project, sprint.as_deref())
}

pub(super) fn child_rows(app: &Path, epic: &str) -> Result<Vec<jira::Row>, atlassian::Error> {
    let client = client_for(app)?;
    let sprint = jira::sprint_field(&client).ok().flatten();
    jira::epic_children(&client, epic, sprint.as_deref())
}

pub(super) fn load_page(
    app: PathBuf,
    filter: Filter,
    typed: String,
    refresh: bool,
) -> Result<Load, atlassian::Error> {
    let Some(credentials) = atlassian::load(&app)? else {
        return Err(atlassian::Error::Invalid(
            "Connect Atlassian in Settings".into(),
        ));
    };
    let client = Client::new(&credentials);
    let filter = match filter {
        Filter::Jql(_) => match jira::validate_jql(&client, &typed) {
            Ok(()) => Filter::Jql(typed),
            Err(atlassian::Error::Invalid(message)) => return Ok(Load::Invalid(message)),
            Err(error) => return Err(error),
        },
        filter => filter,
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let cached = if refresh {
        None
    } else {
        jira::load_list(&app, credentials.site(), filter.jql(), now)?
    };
    let sprint = jira::sprint_field(&client).ok().flatten();
    let epic = jira::epic_field(&client).ok().flatten();
    let page = match jira::search_limited(
        &client,
        &filter,
        None,
        sprint.as_deref(),
        epic.as_deref(),
        50,
        None,
    ) {
        Ok(page) => page,
        Err(error) => {
            if let Some(cached) = cached {
                let mut model = ListModel::default();
                jira::append(&mut model, cached.rows, None);
                jira::show_error(&mut model, &error);
                return Ok(Load::Page(model, Vec::new()));
            }
            return Err(error);
        }
    };
    let saved = jira::favourites(&client).unwrap_or_default();
    jira::save_list(
        &app,
        credentials.site(),
        filter.jql(),
        &jira::CachedList {
            fetched_ms: now,
            rows: page.rows.clone(),
            adf: Vec::new(),
        },
    )?;
    let mut model = ListModel::default();
    jira::append(&mut model, page.rows, page.next);
    Ok(Load::Page(model, saved))
}

pub(super) fn cached_model(app: &Path, filter: &Filter, typed: &str) -> Option<ListModel> {
    let credentials = atlassian::load(app).ok().flatten()?;
    let jql = match filter {
        Filter::Jql(_) => typed,
        filter => filter.jql(),
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let cached = jira::load_list(app, credentials.site(), jql, now)
        .ok()
        .flatten()?;
    let mut model = ListModel::default();
    jira::append(&mut model, cached.rows, None);
    Some(model)
}

pub(super) fn next_page(
    app: PathBuf,
    filter: Filter,
    typed: String,
    token: &str,
) -> Result<jira::Page, atlassian::Error> {
    let credentials = atlassian::load(&app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    let client = Client::new(&credentials);
    let filter = match filter {
        Filter::Jql(_) => Filter::Jql(typed),
        filter => filter,
    };
    let sprint = jira::sprint_field(&client).ok().flatten();
    let epic = jira::epic_field(&client).ok().flatten();
    jira::search_limited(
        &client,
        &filter,
        Some(token),
        sprint.as_deref(),
        epic.as_deref(),
        50,
        None,
    )
}
