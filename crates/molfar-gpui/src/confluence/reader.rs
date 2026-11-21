use super::{Event, View, render::DocumentView, service::Service};
use gpui::{Context, Focusable, KeyDownEvent, Window, px};
use molfar_core::confluence::{
    connector::{Connector, Kind, Node},
    page::Page,
    spaces::Space,
};

struct LoadedPage {
    node: Node,
    page: Page,
    space_key: String,
    space: Option<Space>,
    connector: Option<Connector>,
}

#[cfg(test)]
struct OpenScript {
    page: Result<Page, String>,
    ancestors: Vec<Node>,
    children: Vec<Node>,
}

#[cfg(test)]
static OPEN_SCRIPT: std::sync::Mutex<Option<OpenScript>> = std::sync::Mutex::new(None);

#[cfg(test)]
static SCRIPTED_RELATIONS: std::sync::Mutex<Option<(Vec<Node>, Vec<Node>)>> =
    std::sync::Mutex::new(None);

#[cfg(test)]
static ANCESTOR_GATE: std::sync::Mutex<Option<async_channel::Receiver<()>>> =
    std::sync::Mutex::new(None);

#[cfg(test)]
pub(super) fn script_page_open(
    page: Result<Page, String>,
    ancestors: Vec<Node>,
    children: Vec<Node>,
    gate: async_channel::Receiver<()>,
) {
    *OPEN_SCRIPT.lock().expect("open script") = Some(OpenScript {
        page,
        ancestors,
        children,
    });
    *ANCESTOR_GATE.lock().expect("ancestor gate") = Some(gate);
}

#[cfg(test)]
fn scripted_page() -> Option<Result<Page, String>> {
    let script = OPEN_SCRIPT.lock().expect("open script").take()?;
    *SCRIPTED_RELATIONS.lock().expect("scripted relations") =
        Some((script.ancestors, script.children));
    Some(script.page)
}

#[cfg(not(test))]
fn scripted_page() -> Option<Result<Page, String>> {
    None
}

#[cfg(test)]
fn take_scripted_relations() -> Option<(Vec<Node>, Vec<Node>)> {
    SCRIPTED_RELATIONS
        .lock()
        .expect("scripted relations")
        .take()
}

#[cfg(test)]
async fn wait_for_ancestor_gate() {
    let gate = ANCESTOR_GATE.lock().expect("ancestor gate").take();
    if let Some(gate) = gate {
        let _ = gate.recv().await;
    }
}

fn load_page(
    service: &Service,
    id: &str,
    refresh: bool,
    spaces: &[Space],
) -> Result<LoadedPage, String> {
    let (page, connector) = if let Some(page) = scripted_page() {
        (page?, None)
    } else {
        let connector = service.connector()?;
        let page = connector
            .page(id, refresh)
            .map_err(|error| error.to_string())?;
        (page, Some(connector))
    };
    let space = spaces
        .iter()
        .find(|space| space.id == page.space_id)
        .cloned();
    let space_key = space
        .as_ref()
        .map(|space| space.key.clone())
        .unwrap_or_default();
    let node = Node {
        id: page.id.clone(),
        title: page.title.clone(),
        url: page.url.clone(),
        kind: Kind::Page,
        space_key: space_key.clone(),
    };
    Ok(LoadedPage {
        node,
        page,
        space_key,
        space,
        connector,
    })
}

fn page_relations(
    connector: Option<Connector>,
    space: Option<Space>,
    space_key: &str,
    parent_id: Option<String>,
    parent_kind: Kind,
    page_id: &str,
    refresh: bool,
) -> (Vec<Node>, Vec<Node>) {
    #[cfg(test)]
    if let Some(relations) = take_scripted_relations() {
        return relations;
    }

    let Some(connector) = connector else {
        return (Vec::new(), Vec::new());
    };
    let ancestors = connector.lineage(parent_id, parent_kind, space_key);
    let children = space.as_ref().and_then(|space| {
        connector
            .children(space, Some((page_id, Kind::Page)), None, refresh)
            .inspect_err(|error| log::debug!("Confluence page relations: {error}"))
            .ok()
    });
    (
        ancestors,
        children.map_or_else(Vec::new, |children| children.nodes),
    )
}

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
        self.reading = self.document.is_none();
        self.error = None;
        let service = self.service.clone();
        let spaces = self.spaces.clone();
        let query = self.query.clone();
        let page_job = cx
            .background_executor()
            .spawn(async move { load_page(&service, &id, refresh, &spaces) });

        cx.spawn(async move |view, cx| {
            let loaded = match page_job.await {
                Ok(loaded) => loaded,
                Err(error) => {
                    let _ = view.update(cx, |this, cx| {
                        if this.page_generation == generation {
                            this.reading = false;
                            this.failure(error);
                            cx.notify();
                        }
                    });
                    return;
                }
            };
            let LoadedPage {
                node,
                page,
                space_key,
                space,
                connector,
            } = loaded;
            let page_id = page.id.clone();
            let parent_id = page.parent_id.clone();
            let parent_kind = page.parent_kind;
            let shown = view.update(cx, |this, cx| {
                if this.page_generation != generation {
                    return false;
                }
                this.reading = false;
                this.selected_node = Some(node);
                this.selection_source = None;
                this.folded.clear();
                this.document = Some(DocumentView::new(page, Vec::new(), &query));
                this.document_scroll.set_offset(gpui::point(px(0.), px(0.)));
                cx.notify();
                true
            });
            if !matches!(shown, Ok(true)) {
                return;
            }

            let relations_id = page_id.clone();
            let relations = cx
                .background_executor()
                .spawn(async move {
                    #[cfg(test)]
                    wait_for_ancestor_gate().await;
                    page_relations(
                        connector,
                        space,
                        &space_key,
                        parent_id,
                        parent_kind,
                        &relations_id,
                        refresh,
                    )
                })
                .await;
            let _ = view.update(cx, |this, cx| {
                if this.page_generation != generation {
                    return;
                }
                if let Some(document) = this.document.as_mut()
                    && document.page.id == page_id
                {
                    document.ancestors = relations.0;
                    document.children = relations.1;
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
