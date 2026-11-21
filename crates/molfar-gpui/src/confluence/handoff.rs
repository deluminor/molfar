use std::sync::Arc;

use gpui::{
    AppContext, ClipboardItem, Context, Entity, Focusable, Pixels, Point, Subscription, Window,
};
use molfar_core::confluence::{
    connector::{Kind, Node},
    resolve::Link,
};

use crate::{
    input::Input,
    popover::{Anchor, Menu, MenuAction, MenuEvent, MenuItem, menu_popover},
};

use super::{Event, View};

pub(super) struct ReaderMenu {
    menu: Entity<Menu>,
    position: Point<Pixels>,
    _events: Subscription,
}

impl View {
    pub(super) fn copy_link(&self, node: Option<&Node>, cx: &mut Context<Self>) {
        let node = node.or(self.selected_node.as_ref());
        let space = node
            .and_then(|node| self.spaces.iter().find(|space| space.key == node.space_key))
            .or_else(|| self.active_space());
        let Some(space) = space else { return };
        let Ok(url) = url::Url::parse(&space.url) else {
            return;
        };
        let origin = url.origin().ascii_serialization();
        let Some(host) = origin.strip_prefix("https://") else {
            return;
        };
        let link = Link {
            host: host.to_owned(),
            space: space.key.clone(),
            content: node.map(|node| node.id.clone()),
            kind: node
                .map(|node| node.kind)
                .filter(|kind| matches!(kind, Kind::Page | Kind::Folder)),
        };
        let Ok(metadata) = serde_json::to_string(&link) else {
            return;
        };
        cx.write_to_clipboard(ClipboardItem::new_string_with_metadata(
            link.url(),
            metadata,
        ));
    }

    pub(super) fn copy_space(&self, cx: &mut Context<Self>) {
        let Some(space) = self.active_space() else {
            return;
        };
        let Ok(url) = url::Url::parse(&space.url) else {
            return;
        };
        let origin = url.origin().ascii_serialization();
        if let Some(host) = origin.strip_prefix("https://") {
            let link = Link {
                host: host.to_owned(),
                space: space.key.clone(),
                content: None,
                kind: None,
            };
            cx.write_to_clipboard(ClipboardItem::new_string(link.url()));
        }
    }

    pub(super) fn context_menu(&self, cx: &gpui::App) -> Option<impl gpui::IntoElement> {
        self.menu
            .as_ref()
            .map(|menu| menu_popover(&menu.menu, Anchor::Point(menu.position), cx))
    }

    fn open_menu(
        &mut self,
        label: &'static str,
        items: Vec<MenuItem>,
        position: Point<Pixels>,
        action: impl Fn(&mut Self, &str, &mut Context<Self>) + 'static,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let menu = cx.new(|cx| Menu::new(label, items, window, cx));
        let events = cx.subscribe_in(&menu, window, move |view, _, event, window, cx| {
            view.menu = None;
            window.focus(&view.focus, cx);
            if let MenuEvent::Picked(picked, _) = event {
                action(view, picked, cx);
            }
            cx.notify();
        });
        self.menu = Some(ReaderMenu {
            menu,
            position,
            _events: events,
        });
        cx.notify();
    }

    pub(super) fn node_menu(
        &mut self,
        node: Option<Node>,
        position: Point<Pixels>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let items = vec![
            MenuAction::new("copy-link", "Copy MOLFAR link")
                .icon("link")
                .into(),
        ];
        self.open_menu(
            "Confluence link",
            items,
            position,
            move |view, _, cx| {
                if let Some(node) = &node {
                    view.copy_link(Some(node), cx);
                } else {
                    view.copy_space(cx);
                }
            },
            window,
            cx,
        );
    }

    pub(super) fn add_menu(
        &mut self,
        position: Point<Pixels>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let selected = self
            .selection_source
            .as_ref()
            .and_then(|input| input.read(cx).selected_content());
        let space_only = self
            .selected_node
            .as_ref()
            .is_none_or(|node| node.kind == Kind::Folder);
        let items = if self.document.is_some() {
            vec![
                MenuAction::new("page", "This page").into(),
                MenuAction::new("selection", "Text selection")
                    .disabled(selected.is_none())
                    .into(),
                MenuAction::new("children", "This page and direct children").into(),
            ]
        } else if space_only {
            vec![MenuAction::new("children", "Direct child index").into()]
        } else {
            return;
        };
        self.open_menu(
            "Add to chat",
            items,
            position,
            move |view, action, cx| {
                if action == "selection" {
                    if let Some(text) = &selected {
                        cx.emit(Event::AddToChat(text.clone()));
                    }
                } else {
                    view.add_document(action == "children", cx);
                }
            },
            window,
            cx,
        );
    }

    fn add_document(&mut self, include_children: bool, cx: &mut Context<Self>) {
        let page = self.document.as_ref().map(|doc| doc.page.clone());
        let node = self.selected_node.clone();
        let space = node
            .as_ref()
            .and_then(|node| self.spaces.iter().find(|space| space.key == node.space_key))
            .or_else(|| self.active_space())
            .cloned();
        let service = self.service.clone();
        let job = cx.background_executor().spawn(async move {
            let mut content = page
                .as_ref()
                .map_or_else(String::new, |page| page.markdown().0);
            if include_children {
                let space = space.ok_or("Choose a Confluence space.")?;
                let connector = service.connector()?;
                let parent = node.as_ref().map(|node| (node.id.as_str(), node.kind));
                let index = connector
                    .child_index(&space, parent)
                    .map_err(|error| error.to_string())?;
                if !content.is_empty() {
                    content.push_str("\n\n## Direct children\n\n");
                }
                content.push_str(&index);
            }
            Ok::<_, String>(content)
        });
        cx.spawn(async move |view, cx| {
            let result = job.await;
            let _ = view.update(cx, |view, cx| {
                match result {
                    Ok(text) if !text.trim().is_empty() => cx.emit(Event::AddToChat(text)),
                    Ok(_) => (),
                    Err(error) => view.failure(error),
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(super) fn toggle_selection_source(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.selection_source.take().is_none() {
            if let Some(doc) = &self.document {
                let page = Arc::clone(&doc.page);
                let generation = self.page_generation;
                let job = cx
                    .background_executor()
                    .spawn(async move { page.markdown().0 });
                cx.spawn_in(window, async move |view, cx| {
                    let markdown = job.await;
                    let _ = view.update_in(cx, |this, window, cx| {
                        if this.page_generation != generation {
                            return;
                        }
                        let input = cx.new(|cx| {
                            let mut input = Input::markdown_editor("Confluence text selection", cx);
                            input.set_read_only(true);
                            input.set_text(markdown, cx);
                            input
                        });
                        window.focus(&input.focus_handle(cx), cx);
                        this.selection_source = Some(input);
                        cx.notify();
                    });
                })
                .detach();
            }
        } else {
            window.focus(&self.focus, cx);
        }
        cx.notify();
    }
}
