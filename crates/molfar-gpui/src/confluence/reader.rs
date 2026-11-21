use super::{Event, View, render::DocumentView};
use gpui::{Context, Focusable, KeyDownEvent, Window, px};
use molfar_core::confluence::connector::{Kind, Node};

impl View {
    pub(super) fn select_node(&mut self, node: Node, cx: &mut Context<Self>) {
        let id = node.id.clone();
        self.selected_node = Some(node.clone());
        self.error = None;
        if node.kind == Kind::Page {
            self.open_page(id, false, cx);
        } else {
            self.page_generation += 1;
            self.reading = false;
            self.document = None;
        }
        cx.notify();
    }

    pub(super) fn open_page(&mut self, id: String, refresh: bool, cx: &mut Context<Self>) {
        self.page_generation += 1;
        let generation = self.page_generation;
        self.reading = true;
        self.error = None;
        self.document = None;
        self.selection_source = None;
        self.folded.clear();
        let service = self.service.clone();
        let spaces = self.spaces.clone();
        let query = self.query.clone();
        let job = cx.background_executor().spawn(async move {
            let connector = service.connector()?;
            let page = connector
                .page(&id, refresh)
                .map_err(|error| error.to_string())?;
            let space = spaces.iter().find(|space| space.id == page.space_id);
            let children = space
                .and_then(|space| {
                    connector
                        .children(space, Some((&page.id, Kind::Page)), None, refresh)
                        .inspect_err(|error| log::debug!("Confluence page relations: {error}"))
                        .ok()
                })
                .map_or_else(Vec::new, |children| children.nodes);
            let node = Node {
                id: page.id.clone(),
                title: page.title.clone(),
                url: page.url.clone(),
                kind: Kind::Page,
                space_key: space.map_or_else(String::new, |space| space.key.clone()),
            };
            Ok::<_, String>((node, DocumentView::new(page, children, &query)))
        });

        cx.spawn(async move |view, cx| {
            let result = job.await;
            let _ = view.update(cx, |this, cx| {
                if this.page_generation == generation {
                    this.reading = false;
                    match result {
                        Ok((node, document)) => {
                            this.selected_node = Some(node);
                            this.document = Some(document);
                            this.document_scroll.set_offset(gpui::point(px(0.), px(0.)));
                        }
                        Err(error) => this.failure(error),
                    }
                    cx.notify();
                }
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn key_down(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = &event.keystroke;
        let search = self.search.focus_handle(cx);
        let selecting = self
            .selection_source
            .as_ref()
            .is_some_and(|input| input.focus_handle(cx).is_focused(window));
        let find = if cfg!(target_os = "macos") {
            key.modifiers.platform
        } else {
            key.modifiers.control
        };
        if key.key == "f" && find {
            window.focus(&search, cx);
        } else if key.key == "escape" {
            if !self.query.is_empty() {
                self.search
                    .update(cx, |input, cx| input.set_text(String::new(), cx));
            } else if self.space_menu {
                self.space_menu = false;
                cx.notify();
            } else {
                cx.emit(Event::Close);
            }
        } else if search.is_focused(window) || selecting || !self.tree_key(&key.key, cx) {
            return;
        }
        cx.stop_propagation();
    }
}
