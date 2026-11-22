//! The Jira issue list: filters, paging and project → epic browsing.
mod browse;
mod load;
mod view;

use std::path::PathBuf;

use gpui::{AppContext, Context, Entity, EventEmitter, FocusHandle, ListAlignment, ListState, px};
use molfar_core::jira::{self, Filter, GroupBy, ListModel};

use self::load::{Load, cached_model, load_page, next_page};
use super::rows::{Entry, RowView, entries};
use crate::{
    input::{self, Input},
    popover::AnchorSlot,
    theme::content,
};

pub(crate) enum Event {
    Open(String),
    Share(String),
    ShareFailed(String),
    Manage,
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
    grouping: Option<GroupBy>,
    jql: Entity<Input>,
    saved: Vec<Filter>,
    loading: bool,
    browse: Browse,
    selected: Option<String>,
    entries: Vec<Entry>,
    views: Vec<RowView>,
    list: ListState,
    menu_open: bool,
    menu_anchor: AnchorSlot,
    focus: FocusHandle,
    _jql_submit: gpui::Subscription,
}

impl EventEmitter<Event> for JiraList {}

impl JiraList {
    pub(crate) fn new(app: PathBuf, cx: &mut Context<Self>) -> Self {
        let jql = cx.new(|cx| {
            Input::field(
                "JQL",
                "project = KEY ORDER BY updated DESC",
                content(0.4),
                cx,
            )
        });
        let submit = cx.subscribe(&jql, |this, _, _: &input::Submitted, cx| {
            this.choose(Filter::Jql(String::new()), cx)
        });
        Self {
            app,
            model: ListModel::default(),
            filter: Filter::AssignedToMe,
            grouping: None,
            jql,
            saved: Vec::new(),
            loading: false,
            browse: Browse::Issues,
            selected: None,
            entries: Vec::new(),
            views: Vec::new(),
            list: ListState::new(0, ListAlignment::Top, px(320.)),
            menu_open: false,
            menu_anchor: AnchorSlot::default(),
            focus: cx.focus_handle(),
            _jql_submit: submit,
        }
    }

    #[cfg(test)]
    pub(crate) fn show_model(&mut self, model: ListModel) {
        self.model = model;
        self.loading = false;
        self.rebuild();
    }

    #[cfg(test)]
    pub(crate) fn model(&self) -> &ListModel {
        &self.model
    }

    #[cfg(test)]
    pub(crate) fn reject_jql(&mut self, message: String) {
        jira::keep_rows_on_invalid(&mut self.model, message);
        self.rebuild();
    }

    /// Resolves rows once per change, so scrolling only lays out what is visible.
    fn rebuild(&mut self) {
        let now = chrono::Utc::now().timestamp_millis();
        self.views = self
            .model
            .rows
            .iter()
            .map(|row| RowView::new(row, now))
            .collect();
        self.entries = entries(&self.model.rows, self.grouping, self.model.next.is_some());
        self.list.reset(self.entries.len());
    }

    fn set_grouping(&mut self, grouping: Option<GroupBy>, cx: &mut Context<Self>) {
        self.grouping = grouping;
        self.menu_open = false;
        self.rebuild();
        cx.notify();
    }

    pub(crate) fn reload(&mut self, refresh: bool, cx: &mut Context<Self>) {
        self.loading = true;
        let app = self.app.clone();
        let filter = self.filter.clone();
        let typed = self.jql.read(cx).content.to_string();
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
                        this.rebuild();
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
                    Ok(Load::Page(model, saved)) => {
                        this.model = model;
                        this.saved = saved;
                    }
                    Ok(Load::Invalid(message)) => {
                        jira::keep_rows_on_invalid(&mut this.model, message)
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

    pub(crate) fn ensure_loaded(&mut self, cx: &mut Context<Self>) {
        if self.model.rows.is_empty() && !self.loading {
            self.reload(false, cx);
        }
    }

    fn load_more(&mut self, cx: &mut Context<Self>) {
        let Some(token) = self.model.next.clone() else {
            return;
        };
        if self.loading {
            return;
        }
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
                this.rebuild();
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn choose(&mut self, filter: Filter, cx: &mut Context<Self>) {
        let keep = matches!(filter, Filter::Jql(_));
        self.filter = filter;
        self.menu_open = false;
        if !keep {
            self.model.rows.clear();
            self.rebuild();
        }
        self.browse = Browse::Issues;
        self.reload(false, cx);
    }

    fn open_row(&mut self, key: String, cx: &mut Context<Self>) {
        match &self.browse {
            Browse::Projects => self.browse_rows(Browse::Epics(key), cx),
            Browse::Epics(_) => self.browse_rows(Browse::Children(key), cx),
            Browse::Issues | Browse::Children(_) => {
                self.selected = Some(key.clone());
                cx.emit(Event::Open(key));
                cx.notify();
            }
        }
    }
}

#[cfg(test)]
mod tests;
