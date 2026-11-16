use super::*;
use gpui::{
    Bounds, TestAppContext, VisualTestContext, WindowBounds, WindowHandle, WindowOptions, point,
    px, size,
};
use molfar_core::knowledge::ConnectionState;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

mod view;

struct Fixture {
    data: PathBuf,
    root: PathBuf,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.data);
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn fixture(files: &[(&str, &str)]) -> Fixture {
    let temp = std::env::temp_dir().canonicalize().unwrap();
    let root = temp.join(format!("molfar-knowledge-{}", uuid::Uuid::new_v4()));
    let data = temp.join(format!("molfar-knowledge-data-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&data).unwrap();
    for (path, body) in files {
        let file = root.join(path);
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(file, body).unwrap();
    }
    let saved = serde_json::json!({
        "id": "saved",
        "root": root.to_string_lossy(),
        "name": "Vault",
    });
    std::fs::write(data.join("knowledge-vault.json"), saved.to_string()).unwrap();
    Fixture { data, root }
}

fn empty_data() -> Fixture {
    let data = std::env::temp_dir()
        .canonicalize()
        .unwrap()
        .join(format!("molfar-knowledge-data-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&data).unwrap();
    Fixture {
        data,
        root: PathBuf::new(),
    }
}

/// Knowledge as it first appears: tree folded, no note open.
fn open_fresh(cx: &mut TestAppContext, data: PathBuf) -> WindowHandle<Knowledge> {
    cx.update(|cx| cx.set_reduce_motion(true));
    let window = cx.update(|cx| {
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    point(px(0.), px(0.)),
                    size(px(1100.), px(720.)),
                ))),
                ..Default::default()
            },
            |_, cx| {
                let service = cx.new(|cx| VaultService::new(data, cx));
                cx.new(|cx| Knowledge::new(service, cx))
            },
        )
        .unwrap()
    });
    cx.run_until_parked();
    window
}

/// Knowledge with the tree shown and the first note open, as most flows start.
fn open(cx: &mut TestAppContext, data: PathBuf) -> WindowHandle<Knowledge> {
    let window = open_fresh(cx, data);
    window
        .update(cx, |view, _, cx| {
            view.tree_open = true;
            view.expanded = super::tree::folders(&view.notes);
            view.rebuild_tree(cx);
            if let Some(first) = view.visible(cx).first() {
                view.open_note(first.path.clone(), cx);
            }
        })
        .unwrap();
    cx.run_until_parked();
    window
}

#[gpui::test]
fn no_vault_offers_a_folder_and_a_broken_root_shows_its_reason(cx: &mut TestAppContext) {
    let data = empty_data();
    let window = open(cx, data.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-empty").is_some());
    assert!(visual.debug_bounds("knowledge-choose").is_some());
    assert!(visual.debug_bounds("knowledge-reason").is_none());

    let broken = empty_data();
    let file = broken.data.join("not-a-directory");
    std::fs::write(&file, "x").unwrap();
    let saved = serde_json::json!({
        "id": "saved",
        "root": file.to_string_lossy(),
        "name": "Vault",
    });
    std::fs::write(broken.data.join("knowledge-vault.json"), saved.to_string()).unwrap();
    let window = open(cx, broken.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-reason").is_some());
    window
        .update(visual, |view, _, _| {
            assert_eq!(
                view.state,
                ConnectionState::Broken("Vault path must be a directory.".into())
            );
        })
        .unwrap();
}

#[gpui::test]
fn connected_vault_lists_notes_and_shows_the_first_body(cx: &mut TestAppContext) {
    let vault = fixture(&[
        ("beta.md", "Beta body\n"),
        ("notes/alpha.md", "Alpha body\n"),
        (".hidden.md", "Hidden\n"),
    ]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-note-0").is_some());
    assert!(visual.debug_bounds("knowledge-note-1").is_some());
    assert!(visual.debug_bounds("knowledge-note-2").is_none());
    assert!(visual.debug_bounds("knowledge-preview").is_some());
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.selected.as_deref(), Some("beta.md"));
            assert_eq!(view.source.read(cx).content.as_ref(), "Beta body\n");
            view.filter
                .update(cx, |input, cx| input.set_text("alpha".into(), cx));
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-note-1").is_none());
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.visible(cx)[0].path, "notes/alpha.md");
        })
        .unwrap();
}

#[gpui::test]
fn save_writes_the_current_revision_and_a_stale_save_keeps_the_draft(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Beta body\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            view.source
                .update(cx, |input, cx| input.set_text("Beta edited\n".into(), cx));
        })
        .unwrap();
    let save = visual.debug_bounds("knowledge-save").unwrap();
    visual.simulate_click(save.center(), Default::default());
    visual.run_until_parked();
    assert_eq!(
        std::fs::read_to_string(vault.root.join("beta.md")).unwrap(),
        "Beta edited\n"
    );

    std::fs::write(vault.root.join("beta.md"), "External edit\n").unwrap();
    window
        .update(visual, |view, _, cx| {
            view.source
                .update(cx, |input, cx| input.set_text("Draft kept\n".into(), cx));
        })
        .unwrap();
    let save = visual.debug_bounds("knowledge-save").unwrap();
    visual.simulate_click(save.center(), Default::default());
    visual.run_until_parked();
    assert_eq!(
        std::fs::read_to_string(vault.root.join("beta.md")).unwrap(),
        "External edit\n"
    );
    assert!(visual.debug_bounds("knowledge-conflict").is_some());
    window
        .update(visual, |view, _, cx| {
            let draft = view.drafts.get("beta.md").unwrap();
            assert!(draft.conflict);
            assert_eq!(draft.text, "Draft kept\n");
            assert_eq!(view.source.read(cx).content.as_ref(), "Draft kept\n");
        })
        .unwrap();
    let reload = visual.debug_bounds("knowledge-reload").unwrap();
    visual.simulate_click(reload.center(), Default::default());
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let draft = view.drafts.get("beta.md").unwrap();
            assert!(!draft.conflict);
            assert_eq!(view.source.read(cx).content.as_ref(), "External edit\n");
        })
        .unwrap();
}

#[gpui::test]
fn crlf_notes_are_saved_with_their_original_line_endings(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Line\r\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.source.read(cx).content.as_ref(), "Line\n");
            view.source
                .update(cx, |input, cx| input.set_text("Line\nTwo\n".into(), cx));
        })
        .unwrap();
    let save = visual.debug_bounds("knowledge-save").unwrap();
    visual.simulate_click(save.center(), Default::default());
    visual.run_until_parked();
    assert_eq!(
        std::fs::read(vault.root.join("beta.md")).unwrap(),
        b"Line\r\nTwo\r\n"
    );
}

#[gpui::test]
fn a_resolved_link_opens_the_other_note(cx: &mut TestAppContext) {
    let vault = fixture(&[("A.md", "See [[B]]\n"), ("B.md", "Bee\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let footer = visual.debug_bounds("knowledge-relations-toggle").unwrap();
    visual.simulate_click(footer.center(), Default::default());
    visual.run_until_parked();
    let link = visual.debug_bounds("knowledge-link-0").unwrap();
    visual.simulate_click(link.center(), Default::default());
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.selected.as_deref(), Some("B.md"));
            assert_eq!(view.source.read(cx).content.as_ref(), "Bee\n");
        })
        .unwrap();
}

#[gpui::test]
fn concurrent_snapshots_share_one_scan(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Beta body\n")]);
    let service = cx.update(|cx| cx.new(|cx| VaultService::new(vault.data.clone(), cx)));
    cx.run_until_parked();
    let tasks = service.update(cx, |service, cx| {
        assert!(matches!(service.state(), ConnectionState::Ready(_)));
        (service.snapshot(true, cx), service.snapshot(true, cx))
    });
    cx.run_until_parked();
    service.read_with(cx, |service, _| assert_eq!(service.scans_started(), 1));
    let again = service.update(cx, |service, cx| service.snapshot(false, cx));
    cx.run_until_parked();
    service.read_with(cx, |service, _| assert_eq!(service.scans_started(), 1));
    drop((tasks, again));
}

#[gpui::test]
fn disconnect_removes_the_vault_and_shows_the_empty_state(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Beta body\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let button = visual.debug_bounds("knowledge-disconnect").unwrap();
    visual.simulate_click(button.center(), Default::default());
    visual.run_until_parked();
    assert!(!vault.data.join("knowledge-vault.json").exists());
    assert!(visual.debug_bounds("knowledge-empty").is_some());
    assert!(visual.debug_bounds("knowledge-choose").is_some());
}

#[gpui::test]
fn disconnect_asks_before_discarding_a_dirty_draft(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Beta body\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            view.source
                .update(cx, |input, cx| input.set_text("Dirty\n".into(), cx));
        })
        .unwrap();
    let button = visual.debug_bounds("knowledge-disconnect").unwrap();
    visual.simulate_click(button.center(), Default::default());
    visual.run_until_parked();
    assert!(visual.has_pending_prompt());
    assert!(vault.data.join("knowledge-vault.json").exists());
    visual.simulate_prompt_answer("Cancel");
    visual.run_until_parked();
    assert!(vault.data.join("knowledge-vault.json").exists());
    let button = visual.debug_bounds("knowledge-disconnect").unwrap();
    visual.simulate_click(button.center(), Default::default());
    visual.run_until_parked();
    visual.simulate_prompt_answer("Disconnect");
    visual.run_until_parked();
    assert!(!vault.data.join("knowledge-vault.json").exists());
    assert!(visual.debug_bounds("knowledge-empty").is_some());
}

#[cfg(unix)]
#[gpui::test]
fn a_failed_save_is_shown_and_leaves_the_file_unchanged(cx: &mut TestAppContext) {
    let vault = fixture(&[("beta.md", "Beta body\n")]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let _restore = Restore(vault.root.clone());
    std::fs::set_permissions(&vault.root, std::fs::Permissions::from_mode(0o555)).unwrap();
    let save = visual.debug_bounds("knowledge-save").unwrap();
    visual.simulate_click(save.center(), Default::default());
    visual.run_until_parked();
    assert_eq!(
        std::fs::read_to_string(vault.root.join("beta.md")).unwrap(),
        "Beta body\n"
    );
    assert!(visual.debug_bounds("knowledge-error").is_some());
}

#[cfg(unix)]
struct Restore(PathBuf);

#[cfg(unix)]
impl Drop for Restore {
    fn drop(&mut self) {
        let _ = std::fs::set_permissions(&self.0, std::fs::Permissions::from_mode(0o755));
    }
}
