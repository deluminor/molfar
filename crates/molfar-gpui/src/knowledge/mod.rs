use crate::{
    input::{self, Input},
    theme::*,
};
use gpui::{
    App, Context, Entity, EventEmitter, FocusHandle, Focusable, KeyBinding, Subscription, Window,
    div, prelude::*,
};
use molfar_core::knowledge::{ConnectionState, VaultNote};
use std::collections::HashMap;

mod document;
mod drafts;
mod edit;
mod page;
mod service;
#[cfg(test)]
mod tests;

use drafts::Draft;
pub(crate) use service::VaultService;

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
    state: ConnectionState,
    notes: Vec<VaultNote>,
    selected: Option<String>,
    preview: bool,
    drafts: HashMap<String, Draft>,
    prepared: String,
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
        let filter = cx.new(|cx| Input::field("Filter notes", "Filter notes", content(0.4), cx));
        filter.update(cx, |input, _| input.set_font_size(12.));
        let source = cx.new(|cx| {
            let mut input = Input::editor(cx);
            input.set_font_size(13.);
            input.set_editor_path("note.md".into());
            input
        });
        let subscriptions = vec![
            cx.subscribe(&filter, |_, _, _: &input::Changed, cx| cx.notify()),
            cx.subscribe(&source, |this, _, _: &input::Changed, cx| {
                if !this.applying {
                    this.remember_edit(cx);
                }
            }),
            cx.subscribe(&service, |this, _, _: &service::Event, cx| {
                this.sync(cx);
                if matches!(this.state, ConnectionState::Ready(_)) {
                    this.reload(cx);
                }
            }),
        ];
        let mut this = Self {
            service,
            focus: cx.focus_handle(),
            filter,
            source,
            loaded: false,
            state: ConnectionState::Empty,
            notes: Vec::new(),
            selected: None,
            preview: true,
            drafts: HashMap::new(),
            prepared: String::new(),
            applying: false,
            busy: false,
            error: None,
            _subscriptions: subscriptions,
        };
        this.sync(cx);
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
            .on_action(cx.listener(|this, _: &SaveNote, _, cx| this.save(cx)))
            .on_action(cx.listener(|this, _: &ReloadNote, _, cx| this.reload_note(cx)))
            .on_action(cx.listener(|this, action: &OpenVaultNote, _, cx| {
                this.open_note(action.0.clone(), cx);
            }))
            .child(if !self.loaded {
                self.message("Loading vault…", None, cx)
            } else if matches!(self.state, ConnectionState::Ready(_)) {
                self.workspace(cx)
            } else {
                let reason = match &self.state {
                    ConnectionState::Broken(reason) => Some(reason.clone()),
                    _ => None,
                };
                self.message("There is no vault.", reason, cx)
            })
    }
}
