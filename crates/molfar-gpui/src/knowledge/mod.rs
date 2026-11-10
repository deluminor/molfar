use crate::{
    input::{self, Input},
    theme::*,
};
use gpui::{
    App, Context, Entity, EventEmitter, FocusHandle, Focusable, KeyBinding, Subscription, Window,
    div, prelude::*,
};
use molfar_core::knowledge::{ConnectionState, NoteProperty, VaultNote};
use std::collections::{HashMap, HashSet};

mod chrome;
mod connect;
mod document;
mod drafts;
mod edit;
mod graph;
mod loading;
mod page;
mod panes;
mod service;
mod service_companion;
mod sync;
#[cfg(test)]
mod tests;
mod tree;
mod types;

use drafts::Draft;
use graph::GraphView;
pub(crate) use service::VaultService;
use tree::TreeRow;
use types::{GraphStats, ScanMeta};

pub(crate) enum Event {
    Close,
}

#[derive(Clone, Debug, PartialEq, gpui::Action)]
#[action(namespace = knowledge, no_json)]
pub(crate) struct OpenVaultNote(pub String);

gpui::actions!(knowledge, [SaveNote, ReloadNote]);

pub(crate) fn bind(cx: &mut App) {
    let modifier = if cfg!(target_os = "macos") {
        "cmd"
    } else {
        "ctrl"
    };
    cx.bind_keys([KeyBinding::new(
        &format!("{modifier}-s"),
        SaveNote,
        Some("Knowledge"),
    )]);
}

pub(crate) struct Knowledge {
    service: Entity<VaultService>,
    focus: FocusHandle,
    filter: Entity<Input>,
    source: Entity<Input>,
    loaded: bool,
    connecting: bool,
    state: ConnectionState,
    notes: Vec<VaultNote>,
    meta: ScanMeta,
    stats: GraphStats,
    graph: Entity<GraphView>,
    tree_rows: Vec<(TreeRow, Option<usize>)>,
    collapsed: HashSet<String>,
    tree_open: bool,
    panel_open: bool,
    widths: panes::PaneWidths,
    resize: Option<panes::Resize>,
    neighbors_only: bool,
    selected: Option<String>,
    preview: bool,
    drafts: HashMap<String, Draft>,
    prepared: String,
    preview_blocks: Vec<document::PreviewBlock>,
    relations: document::Relations,
    properties: Vec<NoteProperty>,
    applying: bool,
    busy: bool,
    error: Option<String>,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<Event> for Knowledge {}

impl Focusable for Knowledge {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Knowledge {
    pub(crate) fn new(service: Entity<VaultService>, cx: &mut Context<Self>) -> Self {
        let filter = cx.new(|cx| {
            Input::field(
                "Search vault",
                "Find notes, tags, aliases…",
                content(0.4),
                cx,
            )
        });
        let graph = cx.new(|_| GraphView::new());
        filter.update(cx, |input, _| input.set_font_size(12.));
        let source = cx.new(|cx| {
            let mut input = Input::editor(cx);
            input.set_font_size(13.);
            input.set_editor_path("note.md".into());
            input
        });
        let subscriptions = vec![
            Self::subscribe_graph(&graph, cx),
            cx.subscribe(&filter, |this, _, _: &input::Changed, cx| {
                this.rebuild_tree(cx);
                this.refresh_graph(cx);
                cx.notify();
            }),
            cx.subscribe(&source, |this, _, _: &input::Changed, cx| {
                if !this.applying {
                    this.remember_edit(cx);
                }
            }),
            cx.subscribe(&service, |this, service, _: &service::Event, cx| {
                let failed = service.read(cx).error().is_some();
                let before = this.vault_id();
                this.sync(cx);
                if this.connecting {
                    cx.notify();
                } else if matches!(this.state, ConnectionState::Ready(_)) {
                    if before.is_some() && before != this.vault_id() {
                        this.clear_vault(cx);
                    }
                    if !failed {
                        this.error = None;
                    }
                    this.reload(cx);
                } else if !failed {
                    this.clear_vault(cx);
                } else {
                    cx.notify();
                }
            }),
        ];
        let mut this = Self {
            service,
            focus: cx.focus_handle(),
            filter,
            source,
            loaded: false,
            connecting: false,
            state: ConnectionState::Empty,
            notes: Vec::new(),
            meta: ScanMeta::default(),
            stats: GraphStats::default(),
            graph,
            tree_rows: Vec::new(),
            collapsed: HashSet::new(),
            tree_open: true,
            panel_open: true,
            widths: panes::PaneWidths::default(),
            resize: None,
            neighbors_only: false,
            selected: None,
            preview: true,
            drafts: HashMap::new(),
            prepared: String::new(),
            preview_blocks: Vec::new(),
            relations: document::Relations::default(),
            properties: Vec::new(),
            applying: false,
            busy: false,
            error: None,
            _subscriptions: subscriptions,
        };
        this.sync(cx);
        this.restore_widths(cx);
        if matches!(this.state, ConnectionState::Ready(_)) {
            this.reload(cx);
        }
        this
    }
}

impl gpui::Render for Knowledge {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("knowledge")
            .debug_selector(|| "knowledge".into())
            .key_context("Knowledge")
            .track_focus(&self.focus)
            .size_full()
            .flex()
            .flex_col()
            .bg(background_base())
            .capture_key_down(cx.listener(|_, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key == "escape" {
                    cx.emit(Event::Close);
                    cx.stop_propagation();
                }
            }))
            .on_mouse_move(
                cx.listener(|this, event: &gpui::MouseMoveEvent, window, cx| {
                    this.drag_resize(event, window, cx);
                }),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_resize(cx)),
            )
            .on_mouse_up_out(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| this.end_resize(cx)),
            )
            .on_action(cx.listener(|this, _: &SaveNote, _, cx| this.save(cx)))
            .on_action(cx.listener(|this, _: &ReloadNote, _, cx| this.reload_note(cx)))
            .on_action(cx.listener(|this, action: &OpenVaultNote, _, cx| {
                this.open_note(action.0.clone(), cx);
            }))
            .child(if !self.loaded {
                self.loading_screen("Opening Knowledge…", None)
            } else if self.connecting {
                self.loading_screen(
                    "Connecting to your vault…",
                    Some("Checking the folder before the first scan".into()),
                )
            } else if matches!(self.state, ConnectionState::Ready(_)) {
                self.workspace(cx)
            } else {
                let reason = match &self.state {
                    ConnectionState::Broken(reason) => Some(reason.clone()),
                    _ => self.error.clone(),
                };
                self.hero(reason, cx)
            })
    }
}
