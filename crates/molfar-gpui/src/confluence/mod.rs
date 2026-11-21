mod handoff;
mod inline;
mod page;
mod reader;
mod render;
pub(crate) mod service;
mod toolbar;
mod tree;
mod tree_panel;
mod widgets;

#[cfg(test)]
mod tests;

use std::collections::{HashMap, HashSet};

use gpui::{
    App, AppContext, Context, Entity, EventEmitter, FocusHandle, Focusable, ScrollHandle,
    Subscription,
};
use molfar_core::{
    confluence::{config, connector::Node, spaces::Space, tree::Children},
    secrets::SecretStore,
};

use crate::{
    input::Input,
    runtime::{Database, locked},
};

use self::{render::DocumentView, service::Service};

pub(crate) enum Event {
    Settings,
    Close,
    AddToChat(String),
}

#[derive(Clone, Debug, PartialEq, gpui::Action)]
#[action(namespace = confluence, no_json)]
pub(crate) struct OpenPage(pub String);

pub(crate) struct View {
    service: Service,
    focus: FocusHandle,
    search: Entity<Input>,
    query: String,
    _search_subscription: Subscription,
    search_generation: u64,
    tree_generation: u64,
    page_generation: u64,
    connected: bool,
    busy: bool,
    reading: bool,
    error: Option<String>,
    spaces: Vec<Space>,
    hidden: HashSet<String>,
    selected_space: Option<String>,
    space_menu: bool,
    branches: HashMap<String, Children>,
    expanded: HashSet<String>,
    pending: HashSet<String>,
    cursor_row: usize,
    tree_scroll: ScrollHandle,
    document_scroll: ScrollHandle,
    results: Vec<Node>,
    document: Option<DocumentView>,
    selected_node: Option<Node>,
    folded: HashSet<usize>,
    menu: Option<handoff::ReaderMenu>,
    selection_source: Option<Entity<Input>>,
}

impl EventEmitter<Event> for View {}
impl Focusable for View {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl View {
    pub(crate) fn new(database: Database, secrets: SecretStore, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| {
            Input::field(
                "Search Confluence",
                "Search Confluence",
                crate::theme::content(0.45),
                cx,
            )
        });
        let subscription = cx.observe(&search, |this, input, cx| {
            let query = input.read(cx).content.to_string();
            if this.query != query {
                this.query = query;
                this.search(cx);
            }
        });
        Self {
            service: Service { database, secrets },
            focus: cx.focus_handle(),
            search,
            query: String::new(),
            _search_subscription: subscription,
            search_generation: 0,
            tree_generation: 0,
            page_generation: 0,
            connected: false,
            busy: false,
            reading: false,
            error: None,
            spaces: Vec::new(),
            hidden: HashSet::new(),
            selected_space: None,
            space_menu: false,
            branches: HashMap::new(),
            expanded: HashSet::new(),
            pending: HashSet::new(),
            cursor_row: 0,
            tree_scroll: ScrollHandle::new(),
            document_scroll: ScrollHandle::new(),
            results: Vec::new(),
            document: None,
            selected_node: None,
            folded: HashSet::new(),
            menu: None,
            selection_source: None,
        }
    }

    pub(crate) fn reload(&mut self, refresh: bool, cx: &mut Context<Self>) {
        self.tree_generation += 1;
        let generation = self.tree_generation;
        self.busy = true;
        self.pending.clear();
        self.error = None;
        let service = self.service.clone();
        let job = cx.background_executor().spawn(async move {
            let Some(connector) = service.open()? else {
                return Ok(None);
            };
            let hidden = config::hidden_spaces(&*locked(&service.database)?)?;
            let spaces = connector
                .spaces(refresh)
                .map_err(|error| error.to_string())?;
            Ok::<_, String>(Some((spaces, hidden)))
        });
        cx.spawn(async move |view, cx| {
            let result = job.await;
            let _ = view.update(cx, |this, cx| {
                if this.tree_generation != generation {
                    return;
                }
                this.busy = false;
                match result {
                    Ok(Some((spaces, hidden))) => {
                        this.connected = true;
                        this.spaces = spaces;
                        this.hidden = hidden;
                        let selected = this
                            .active_space()
                            .filter(|space| !this.hidden.contains(&space.id))
                            .or_else(|| {
                                this.spaces
                                    .iter()
                                    .find(|space| !this.hidden.contains(&space.id))
                            })
                            .map(|space| space.id.clone());
                        let previous = this.selected_node.clone();
                        this.select_space(selected, refresh, cx);
                        if refresh
                            && let Some(node) = previous.filter(|node| {
                                node.kind == molfar_core::confluence::connector::Kind::Page
                            }) {
                                this.open_page(node.id, true, cx);
                        }
                    }
                    Ok(None) => {
                        this.connected = false;
                        this.select_space(None, false, cx);
                    }
                    Err(error) => this.failure(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn active_space(&self) -> Option<&Space> {
        let id = self.selected_space.as_deref()?;
        self.spaces.iter().find(|space| space.id == id)
    }

    fn failure(&mut self, error: String) {
        log::warn!("Confluence: {error}");
        self.error = Some(error);
    }

    fn search(&mut self, cx: &mut Context<Self>) {
        self.search_generation += 1;
        let generation = self.search_generation;
        self.results.clear();
        self.cursor_row = 0;
        let query = self.query.clone();
        if query.trim().is_empty() || !self.connected {
            cx.notify();
            return;
        }

        let service = self.service.clone();
        let hidden = self.hidden.clone();
        let timer = cx
            .background_executor()
            .timer(std::time::Duration::from_millis(240));
        let executor = cx.background_executor().clone();
        cx.spawn(async move |view, cx| {
            timer.await;
            if !view
                .update(cx, |this, _| this.search_generation == generation)
                .unwrap_or(false)
            {
                return;
            }
            let result = executor
                .spawn(async move {
                    service
                        .connector()?
                        .search(
                            &query,
                            None,
                            &hidden,
                            25,
                            molfar_core::confluence::search::Scope::Text,
                        )
                        .map_err(|error| error.to_string())
                })
                .await;
            let _ = view.update(cx, |this, cx| {
                if this.search_generation == generation {
                    match result {
                        Ok(results) => this.results = results,
                        Err(error) => this.failure(error),
                    }
                    cx.notify();
                }
            });
        })
        .detach();
        cx.notify();
    }
}
