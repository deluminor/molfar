use std::path::PathBuf;

use gpui::{
    Context, Entity, EventEmitter, IntoElement, Render, SharedString, Window, div, prelude::*, px,
};
use molfar_core::{
    atlassian::{self, Client},
    jira::{self, Filter, GroupBy, ListModel},
};

use crate::{input::Input, theme::*};

pub(crate) enum Event {
    Open(String),
    Share(String),
    ShareFailed(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Browse {
    Issues,
    Projects,
    Epics(String),
    Children(String),
}

pub(crate) struct JiraList {
    app: PathBuf,
    model: ListModel,
    filter: Filter,
    jql: Entity<Input>,
    saved: Vec<Filter>,
    loading: bool,
    browse: Browse,
}

impl EventEmitter<Event> for JiraList {}

impl JiraList {
    pub(crate) fn new(app: PathBuf, cx: &mut Context<Self>) -> Self {
        let jql = cx.new(|cx| Input::field("jira-jql", "JQL", content(0.45), cx));
        Self {
            app,
            model: ListModel::default(),
            filter: Filter::AssignedToMe,
            jql,
            saved: Vec::new(),
            loading: false,
            browse: Browse::Issues,
        }
    }

    #[cfg(test)]
    pub(crate) fn show_model(&mut self, model: ListModel) {
        self.model = model;
        self.loading = false;
    }

    #[cfg(test)]
    pub(crate) fn model(&self) -> &ListModel {
        &self.model
    }

    #[cfg(test)]
    pub(crate) fn reject_jql(&mut self, message: String) {
        jira::keep_rows_on_invalid(&mut self.model, message);
    }

    fn share(&mut self, cx: &mut Context<Self>) {
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

    pub(crate) fn reload(&mut self, refresh: bool, cx: &mut Context<Self>) {
        self.loading = true;
        let app = self.app.clone();
        let filter = self.filter.clone();
        let typed = self.jql.read(cx).content.to_string();
        let group_by = self.model.group_by;
        cx.spawn(async move |this, cx| {
            if !refresh {
                let cached = cx
                    .background_executor()
                    .spawn({
                        let app = app.clone();
                        let filter = filter.clone();
                        let typed = typed.clone();
                        async move { cached_model(&app, &filter, &typed) }
                    })
                    .await;
                if let Some(model) = cached {
                    let _ = this.update(cx, |this, cx| {
                        this.model.rows = model.rows;
                        cx.notify();
                    });
                }
            }
            let result = cx
                .background_executor()
                .spawn(async move { load_page(app, filter, typed, refresh) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.loading = false;
                match result {
                    Ok(Load::Page(mut model, saved)) => {
                        model.group_by = group_by;
                        this.model = model;
                        this.saved = saved;
                    }
                    Ok(Load::Invalid(message)) => {
                        jira::keep_rows_on_invalid(&mut this.model, message)
                    }
                    Err(error) => jira::show_error(&mut this.model, &error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(crate) fn ensure_loaded(&mut self, cx: &mut Context<Self>) {
        if self.model.rows.is_empty() && !self.loading {
            self.reload(false, cx);
        }
    }

    fn load_more(&mut self, cx: &mut Context<Self>) {
        let Some(token) = self.model.next.clone() else {
            return;
        };
        self.loading = true;
        let app = self.app.clone();
        let filter = self.filter.clone();
        let typed = self.jql.read(cx).content.to_string();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { next_page(app, filter, typed, &token) })
                .await;
            let _ = this.update(cx, |this, cx| {
                this.loading = false;
                match result {
                    Ok(page) => jira::append(&mut this.model, page.rows, page.next),
                    Err(error) => jira::show_error(&mut this.model, &error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn choose(&mut self, filter: Filter, cx: &mut Context<Self>) {
        let keep = matches!(filter, Filter::Jql(_));
        self.filter = filter;
        if !keep {
            self.model.rows.clear();
        }
        self.browse = Browse::Issues;
        self.reload(false, cx);
    }

    fn open_row(&mut self, key: String, cx: &mut Context<Self>) {
        match &self.browse {
            Browse::Projects => self.load_epics(key, cx),
            Browse::Epics(_) => self.load_children(key, cx),
            Browse::Issues | Browse::Children(_) => cx.emit(Event::Open(key)),
        }
    }

    fn load_projects(&mut self, cx: &mut Context<Self>) {
        self.loading = true;
        self.browse = Browse::Projects;
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { project_rows(&app) })
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
                cx.notify();
            });
        })
        .detach();
    }

    fn load_epics(&mut self, project: String, cx: &mut Context<Self>) {
        self.loading = true;
        self.browse = Browse::Epics(project.clone());
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { epic_rows(&app, &project) })
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
                cx.notify();
            });
        })
        .detach();
    }

    fn load_children(&mut self, epic: String, cx: &mut Context<Self>) {
        self.loading = true;
        self.browse = Browse::Children(epic.clone());
        let app = self.app.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { child_rows(&app, &epic) })
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
                cx.notify();
            });
        })
        .detach();
    }

    fn copy_link(&mut self, cx: &mut Context<Self>) {
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
                Ok(link) => {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(link));
                }
                Err(error) => cx.emit(Event::ShareFailed(error)),
            });
        })
        .detach();
    }
}

enum Load {
    Page(ListModel, Vec<Filter>),
    Invalid(String),
}

fn client_for(app: &std::path::Path) -> Result<Client, atlassian::Error> {
    let credentials = atlassian::load(app)?
        .ok_or_else(|| atlassian::Error::Invalid("Connect Atlassian in Settings".into()))?;
    Ok(Client::new(&credentials))
}

fn project_rows(app: &std::path::Path) -> Result<Vec<jira::Row>, atlassian::Error> {
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

fn epic_rows(app: &std::path::Path, project: &str) -> Result<Vec<jira::Row>, atlassian::Error> {
    let client = client_for(app)?;
    let sprint = jira::sprint_field(&client).ok().flatten();
    jira::epics(&client, project, sprint.as_deref())
}

fn child_rows(app: &std::path::Path, epic: &str) -> Result<Vec<jira::Row>, atlassian::Error> {
    let client = client_for(app)?;
    let sprint = jira::sprint_field(&client).ok().flatten();
    jira::epic_children(&client, epic, sprint.as_deref())
}

fn load_page(
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
    let _ = cached;
    jira::append(&mut model, page.rows, page.next);
    Ok(Load::Page(model, saved))
}

fn cached_model(app: &std::path::Path, filter: &Filter, typed: &str) -> Option<ListModel> {
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

fn next_page(
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

impl Render for JiraList {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let groups = jira::groups(&self.model.rows, self.model.group_by);
        div()
            .id("jira-list")
            .size_full()
            .flex()
            .flex_col()
            .gap_1()
            .p_2()
            .child(
                div()
                    .flex()
                    .gap_1()
                    .flex_wrap()
                    .child(filter_chip("Assigned to me", cx, |this, cx| {
                        this.choose(Filter::AssignedToMe, cx)
                    }))
                    .child(filter_chip("Reported by me", cx, |this, cx| {
                        this.choose(Filter::ReportedByMe, cx)
                    }))
                    .child(filter_chip("Watched", cx, |this, cx| {
                        this.choose(Filter::Watched, cx)
                    }))
                    .child(filter_chip("Current sprint", cx, |this, cx| {
                        this.choose(Filter::CurrentSprint, cx)
                    }))
                    .child(filter_chip("JQL", cx, |this, cx| {
                        this.choose(Filter::Jql(String::new()), cx)
                    }))
                    .children(self.saved_chips(cx)),
            )
            .child(self.jql.clone())
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(filter_chip("Group by epic", cx, |this, cx| {
                        this.model.group_by = GroupBy::Epic;
                        cx.notify();
                    }))
                    .child(filter_chip("Group by status", cx, |this, cx| {
                        this.model.group_by = GroupBy::Status;
                        cx.notify();
                    }))
                    .child(filter_chip("Refresh", cx, |this, cx| this.reload(true, cx)))
                    .child(filter_chip("Add to chat", cx, |this, cx| this.share(cx)))
                    .child(filter_chip("Copy link", cx, |this, cx| this.copy_link(cx)))
                    .child(filter_chip("Projects", cx, |this, cx| {
                        this.load_projects(cx)
                    })),
            )
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.45))
                    .child("Key  Type  Summary  Status  Priority  Assignee  Sprint  Updated"),
            )
            .child(div().text_size(px(12.)).child(self.status_text()))
            .when(self.model.next.is_some(), |pane| {
                pane.child(filter_chip("Load more", cx, |this, cx| this.load_more(cx)))
            })
            .children(groups.into_iter().map(|group| {
                div().flex().flex_col().child(group.title).children(
                    group
                        .indexes
                        .into_iter()
                        .filter_map(|index| self.model.rows.get(index).cloned())
                        .map(|row| {
                            let key = row.key.clone();
                            div()
                                .id(SharedString::from(format!("jira-row-{key}")))
                                .text_size(px(12.))
                                .child(format!(
                                    "{}  {}  {}  {}  {}  {}  {}  {}",
                                    row.key,
                                    row.type_name,
                                    row.summary,
                                    row.status,
                                    row.priority,
                                    row.assignee,
                                    row.sprint,
                                    row.updated
                                ))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.open_row(key.clone(), cx);
                                }))
                        }),
                )
            }))
    }
}

impl JiraList {
    fn saved_chips(&self, cx: &mut Context<Self>) -> Vec<gpui::AnyElement> {
        let mut chips = Vec::new();
        for (index, filter) in self.saved.iter().enumerate() {
            let Filter::Saved { name, .. } = filter else {
                continue;
            };
            chips.push(
                filter_chip(name.clone(), cx, move |this, cx| {
                    if let Some(filter) = this.saved.get(index).cloned() {
                        this.choose(filter, cx);
                    }
                })
                .into_any_element(),
            );
        }
        chips
    }

    fn status_text(&self) -> String {
        if self.loading {
            "Loading…".into()
        } else if self.model.offline {
            "Jira is offline".into()
        } else if self.model.unauthorized {
            "Jira authorization failed".into()
        } else if self.model.rate_limited {
            "Jira rate limit reached".into()
        } else if let Some(error) = &self.model.error {
            error.clone()
        } else if self.model.rows.is_empty() {
            "No issues".into()
        } else {
            String::new()
        }
    }
}

fn filter_chip(
    label: impl Into<SharedString>,
    cx: &mut Context<JiraList>,
    action: impl Fn(&mut JiraList, &mut Context<JiraList>) + 'static,
) -> impl IntoElement {
    let label = label.into();
    div()
        .id(SharedString::from(format!("jira-filter-{label}")))
        .px_2()
        .text_size(px(12.))
        .child(label)
        .on_click(cx.listener(move |this, _, _, cx| action(this, cx)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use molfar_core::jira::Row;

    #[gpui::test]
    fn invalid_jql_keeps_rows_and_groups_name_missing_epic(cx: &mut gpui::TestAppContext) {
        cx.update(|cx| {
            let list = cx.new(|cx| JiraList::new(PathBuf::from("/tmp/jira-list"), cx));
            list.update(cx, |list, cx| {
                list.show_model(ListModel {
                    rows: vec![
                        Row {
                            key: "TB-1".into(),
                            epic_key: "EP-1".into(),
                            epic_summary: "Epic".into(),
                            status: "Open".into(),
                            ..Row::default()
                        },
                        Row {
                            key: "TB-2".into(),
                            ..Row::default()
                        },
                    ],
                    ..ListModel::default()
                });
                list.reject_jql("Expected operator".into());
                assert_eq!(list.model().rows.len(), 2);
                assert_eq!(list.model().error.as_deref(), Some("Expected operator"));
                let titles: Vec<_> = jira::groups(&list.model().rows, GroupBy::Epic)
                    .into_iter()
                    .map(|group| group.title)
                    .collect();
                assert_eq!(titles, ["EP-1 Epic", "No epic"]);
                list.model.more = Some("past-cap".into());
                list.load_more(cx);
                assert!(!list.loading);
                list.model.next = Some("page-2".into());
                list.load_more(cx);
                assert!(list.loading);
                let _ = cx;
            });
        });
    }
}
