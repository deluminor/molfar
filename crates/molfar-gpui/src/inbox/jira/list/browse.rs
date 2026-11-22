//! Browsing projects and epics, keyboard steps and sharing the list.
use gpui::Context;
use molfar_core::{
    atlassian,
    jira::{self, Filter, ListModel},
};

use super::{
    Browse, Event, JiraList,
    load::{child_rows, epic_rows, project_rows},
};
use crate::inbox::jira::rows::Entry;

impl JiraList {
    pub(super) fn share(&mut self, cx: &mut Context<Self>) {
        if self.model.offline {
            cx.emit(Event::ShareFailed("offline: Jira is offline".into()));
            return;
        }
        let rows = self.model.rows.clone();
        let title = self.filter.jql().to_string();
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let text = cx
                .background_executor()
                .spawn(async move {
                    let credentials = atlassian::load(&app)
                        .ok()
                        .flatten()
                        .ok_or_else(|| "offline: Jira is not connected".to_string())?;
                    let link = jira::format_jql(credentials.site(), &title)
                        .map_err(|error| error.to_string())?;
                    Ok::<_, String>(jira::list_index(&title, &rows, &link))
                })
                .await;
            let _ = this.update(cx, |_, cx| match text {
                Ok(text) => cx.emit(Event::Share(text)),
                Err(error) => cx.emit(Event::ShareFailed(error)),
            });
        })
        .detach();
    }

    /// Up/Down move the selection through issue rows and open the issue.
    pub(super) fn step(&mut self, down: bool, cx: &mut Context<Self>) {
        let keys: Vec<(usize, String)> = self
            .entries
            .iter()
            .enumerate()
            .filter_map(|(position, entry)| match entry {
                Entry::Issue { index, .. } => self
                    .model
                    .rows
                    .get(*index)
                    .map(|row| (position, row.key.clone())),
                _ => None,
            })
            .collect();
        let current = keys
            .iter()
            .position(|(_, key)| self.selected.as_ref() == Some(key));
        let next = match (current, down) {
            (None, _) => 0,
            (Some(at), true) => (at + 1).min(keys.len().saturating_sub(1)),
            (Some(at), false) => at.saturating_sub(1),
        };
        if let Some((position, key)) = keys.get(next).cloned() {
            self.list.scroll_to_reveal_item(position);
            self.open_row(key, cx);
        }
    }

    pub(super) fn browse_rows(&mut self, browse: Browse, cx: &mut Context<Self>) {
        self.loading = true;
        self.menu_open = false;
        self.browse = browse.clone();
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match browse {
                        Browse::Epics(project) => epic_rows(&app, &project),
                        Browse::Children(epic) => child_rows(&app, &epic),
                        Browse::Projects | Browse::Issues => project_rows(&app),
                    }
                })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.loading = false;
                match result {
                    Ok(rows) => {
                        this.model = ListModel::default();
                        jira::append(&mut this.model, rows, None);
                    }
                    Err(error) => jira::show_error(&mut this.model, &error),
                }
                this.rebuild();
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn back(&mut self, cx: &mut Context<Self>) {
        match self.browse.clone() {
            Browse::Children(_) => {
                let project = self
                    .model
                    .rows
                    .first()
                    .and_then(|row| row.key.split('-').next())
                    .unwrap_or_default()
                    .to_string();
                if project.is_empty() {
                    self.browse_rows(Browse::Projects, cx);
                } else {
                    self.browse_rows(Browse::Epics(project), cx);
                }
            }
            Browse::Epics(_) => self.browse_rows(Browse::Projects, cx),
            Browse::Projects | Browse::Issues => {
                let filter = self.filter.clone();
                self.choose(filter, cx);
            }
        }
    }

    pub(super) fn copy_link(&mut self, cx: &mut Context<Self>) {
        if self.model.offline {
            cx.emit(Event::ShareFailed("offline: Jira is offline".into()));
            return;
        }
        let jql = match &self.filter {
            Filter::Jql(_) => self.jql.read(cx).content.to_string(),
            filter => filter.jql().to_string(),
        };
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let credentials = atlassian::load(&app)
                        .ok()
                        .flatten()
                        .ok_or_else(|| "offline: Jira is not connected".to_string())?;
                    jira::format_jql(credentials.site(), &jql).map_err(|error| error.to_string())
                })
                .await;
            let _ = this.update(cx, |_, cx| match result {
                Ok(link) => cx.write_to_clipboard(gpui::ClipboardItem::new_string(link)),
                Err(error) => cx.emit(Event::ShareFailed(error)),
            });
        })
        .detach();
    }
}
