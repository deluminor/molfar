use super::Knowledge;
use super::drafts;
use gpui::{App, Context};
use molfar_core::knowledge::{
    ConnectionState, VaultNote, VaultSnapshot, embed_images, note_matches, note_properties,
    prepare_preview,
};

impl Knowledge {
    pub(super) fn sync(&mut self, cx: &mut Context<Self>) {
        let service = self.service.read(cx);
        self.loaded = service.loaded();
        self.connecting = service.connecting();
        self.state = service.state().clone();
        if let Some(error) = service.error() {
            self.error = Some(error.to_string());
        }
        cx.notify();
    }

    pub(super) fn reload(&mut self, cx: &mut Context<Self>) {
        let task = self
            .service
            .update(cx, |service, cx| service.snapshot(true, cx));
        self.busy = true;
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(snapshot) => this.apply_snapshot(snapshot, cx),
                    Err(error) => {
                        if !error.contains("cancelled") {
                            this.error = Some(error);
                        }
                        cx.notify();
                    }
                }
            });
        })
        .detach();
    }

    pub(super) fn apply_snapshot(&mut self, snapshot: VaultSnapshot, cx: &mut Context<Self>) {
        let current = self.service.read(cx).state().clone();
        let ConnectionState::Ready(connection) = &current else {
            return;
        };
        if snapshot.connection.id != connection.id {
            return;
        }
        self.notes = snapshot.notes;
        self.entries = snapshot.entries;
        self.meta = super::types::ScanMeta {
            warnings: snapshot.warnings,
            truncated: snapshot.truncated,
            scanned_at: Some(chrono::Local::now()),
        };
        self.error = None;
        self.rebuild_tree(cx);
        self.refresh_graph(cx);
        let visible = self.visible(cx);
        let kept = self
            .selected
            .clone()
            .filter(|path| visible.iter().any(|note| &note.path == path));
        if let Some(path) = kept {
            self.load_note(path, cx);
        } else {
            self.panel_open = false;
            self.selected = None;
            self.prepared.clear();
            self.preview_blocks.clear();
            cx.notify();
        }
    }

    pub(super) fn visible(&self, cx: &App) -> Vec<VaultNote> {
        let query = self.filter.read(cx).content.trim().to_lowercase();
        self.notes
            .iter()
            .filter(|note| note_matches(note, &query))
            .cloned()
            .collect()
    }

    /// Opens a note in the panel and reveals it in the tree.
    pub(super) fn open_note(&mut self, path: String, cx: &mut Context<Self>) {
        self.panel_open = true;
        let hidden: Vec<String> = super::tree::ancestors(&path)
            .into_iter()
            .filter(|folder| !self.expanded.contains(folder))
            .collect();
        if !hidden.is_empty() {
            self.expanded.extend(hidden);
            self.rebuild_tree(cx);
        }
        self.load_note(path, cx);
    }

    /// Reads a note into the panel state without opening or closing the panel.
    pub(super) fn load_note(&mut self, path: String, cx: &mut Context<Self>) {
        if self.selected.as_deref() != Some(path.as_str()) {
            self.stash(cx);
            self.selected = Some(path.clone());
            self.callouts_toggled.clear();
        }
        self.sync_graph_focus(cx);
        let service = self.service.clone();
        let task = service.update(cx, |service, cx| service.read_note(path.clone(), cx));
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(document) if this.selected.as_deref() == Some(document.path.as_str()) => {
                    this.apply_document(document, cx);
                }
                Ok(_) => {}
                Err(error) => {
                    this.error = Some(error);
                    cx.notify();
                }
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn apply_document(
        &mut self,
        document: molfar_core::knowledge::VaultDocument,
        cx: &mut Context<Self>,
    ) {
        let fresh = drafts::draft_from(&document);
        let path = document.path.clone();
        let draft = self.drafts.entry(path.clone()).or_insert(fresh.clone());
        if draft.revision != fresh.revision && draft.text != fresh.text {
            draft.conflict = true;
            draft.disk = fresh.disk;
            draft.crlf = fresh.crlf;
        } else if !draft.conflict {
            let edited = draft.text != draft.disk;
            draft.revision = fresh.revision;
            draft.disk = fresh.disk;
            draft.crlf = fresh.crlf;
            if !edited {
                draft.text = fresh.text;
            }
        }
        let text = draft.text.clone();
        self.show_text(&text, cx);
        self.prepare(&path, cx);
        cx.notify();
    }

    pub(super) fn show_text(&mut self, text: &str, cx: &mut Context<Self>) {
        self.applying = true;
        self.source
            .update(cx, |input, cx| input.set_text(text.to_string(), cx));
        self.applying = false;
    }

    pub(super) fn prepare(&mut self, path: &str, _cx: &mut Context<Self>) {
        let text = self
            .drafts
            .get(path)
            .map(|draft| draft.text.clone())
            .unwrap_or_default();
        let (properties, body) = note_properties(&text);
        let embedded = embed_images(body, &self.entries, path);
        self.prepared = prepare_preview(&embedded, &self.notes, path);
        let root = self.vault_root();
        self.preview_blocks = super::document::parse_preview(&self.prepared, root.as_deref());
        self.relations = super::document::Relations::of(&self.notes, path);
        self.properties = properties;
    }

    pub(super) fn stash(&mut self, cx: &App) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        let text = self.source.read(cx).content.to_string();
        if let Some(draft) = self.drafts.get_mut(&path) {
            draft.text = text;
        }
    }

    pub(super) fn remember_edit(&mut self, cx: &mut Context<Self>) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        let text = self.source.read(cx).content.to_string();
        if let Some(draft) = self.drafts.get_mut(&path) {
            draft.text = text;
        }
        if self.preview {
            self.prepare(&path, cx);
        }
        cx.notify();
    }

    pub(super) fn save(&mut self, cx: &mut Context<Self>) {
        self.stash(cx);
        let Some(path) = self.selected.clone() else {
            return;
        };
        let Some(draft) = self.drafts.get(&path).cloned() else {
            return;
        };
        let body = drafts::to_disk(&draft.text, draft.crlf);
        let task = self.service.update(cx, |service, cx| {
            service.save_note(path.clone(), body, draft.revision.clone(), cx)
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| match result {
                Ok(document) => {
                    if let Some(draft) = this.drafts.get_mut(&document.path) {
                        let (text, crlf) = drafts::to_editor(&document.body);
                        draft.revision = document.revision;
                        draft.disk = text;
                        draft.crlf = crlf;
                        draft.conflict = false;
                    }
                    this.error = None;
                    cx.notify();
                }
                Err(error) => {
                    if error.starts_with("CONFLICT:")
                        && let Some(draft) = this.drafts.get_mut(&path)
                    {
                        draft.conflict = true;
                    }
                    this.error = Some(error);
                    cx.notify();
                }
            });
        })
        .detach();
    }

    pub(super) fn reload_note(&mut self, cx: &mut Context<Self>) {
        let Some(path) = self.selected.clone() else {
            return;
        };
        self.drafts.remove(&path);
        self.open_note(path, cx);
    }
}
