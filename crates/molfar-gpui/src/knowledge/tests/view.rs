use super::*;
use crate::knowledge::graph::GraphEvent;

const DASHBOARD: &str = "---\naliases:\n  - Panel\ntags: [type/moc]\n---\n# Dashboard\n> [!note] Life\n> ```dataview\n> list\n> ```\nLinks to [[alpha]].\n";

fn vault() -> Fixture {
    fixture(&[
        ("Dashboard.md", DASHBOARD),
        ("notes/alpha.md", "Alpha links [[Dashboard]]\n"),
        ("notes/deep/beta.md", "Beta stands alone\n"),
    ])
}

#[gpui::test]
fn connecting_and_first_scans_show_loaders_instead_of_a_blank_page(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    window
        .update(visual, |view, _, cx| {
            view.connecting = true;
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-loading").is_some());
    assert!(visual.debug_bounds("knowledge-preview").is_none());

    window
        .update(visual, |view, _, cx| {
            view.connecting = false;
            view.notes.clear();
            view.tree_rows.clear();
            view.busy = true;
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-skeleton").is_some());
    assert!(visual.debug_bounds("knowledge-scanning").is_some());
    assert!(visual.debug_bounds("knowledge-footer").is_some());
}

#[gpui::test]
fn the_workspace_shows_header_tree_graph_panel_and_footer(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    for selector in [
        "knowledge-vault",
        "knowledge-count",
        "knowledge-list",
        "knowledge-graph",
        "knowledge-panel",
        "knowledge-footer",
        "knowledge-properties",
        "knowledge-callout-1",
    ] {
        assert!(
            visual.debug_bounds(selector).is_some(),
            "{selector} is shown"
        );
    }
    let tree = visual.debug_bounds("knowledge-list").unwrap();
    let panel = visual.debug_bounds("knowledge-panel").unwrap();
    let graph = visual.debug_bounds("knowledge-graph").unwrap();
    assert!(
        tree.right() <= panel.left() && panel.right() <= graph.left(),
        "the note sits between the tree and the graph"
    );
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.selected.as_deref(), Some("Dashboard.md"));
            assert!(view.source.read(cx).content.starts_with("---\naliases"));
            assert!(!view.prepared.contains("aliases"));
            assert_eq!(view.properties.len(), 2);
            assert_eq!(view.stats.links, 1);
            assert_eq!(view.stats.orphans, 1);
            assert_eq!(view.graph.read(cx).shown_paths().len(), 3);
        })
        .unwrap();

    let close = visual.debug_bounds("knowledge-close-note").unwrap();
    visual.simulate_click(close.center(), Default::default());
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-panel").is_none());
    assert!(visual.debug_bounds("knowledge-graph").is_some());
}

#[gpui::test]
fn graph_selection_opens_the_note_and_neighborhood_narrows_the_graph(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            view.panel_open = false;
            view.on_graph(&GraphEvent::Select("notes/alpha.md".into()), cx);
            assert!(view.panel_open);
            view.on_graph(&GraphEvent::ToggleNeighborhood, cx);
            assert!(view.neighbors_only);
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.selected.as_deref(), Some("notes/alpha.md"));
            assert_eq!(
                view.source.read(cx).content.as_ref(),
                "Alpha links [[Dashboard]]\n"
            );
            let graph = view.graph.read(cx);
            assert_eq!(graph.shown_paths(), ["notes/alpha.md", "Dashboard.md"]);
            assert_eq!(graph.selected_path(), Some("notes/alpha.md"));
        })
        .unwrap();
}

#[gpui::test]
fn folders_collapse_and_search_filters_tree_and_graph(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-note-2").is_some());
    let folder = visual.debug_bounds("knowledge-folder-0").unwrap();
    visual.simulate_click(folder.center(), Default::default());
    visual.run_until_parked();
    assert!(
        visual.debug_bounds("knowledge-note-1").is_none(),
        "notes/ collapsed"
    );
    window
        .update(visual, |view, _, cx| {
            assert!(!view.expanded.contains("notes"));
            view.filter
                .update(cx, |input, cx| input.set_text("beta".into(), cx));
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert_eq!(view.tree_rows.len(), 3, "a search opens matching folders");
            assert_eq!(view.graph.read(cx).shown_paths().len(), 1);
        })
        .unwrap();
}

#[gpui::test]
fn switching_vaults_drops_the_previous_vaults_notes(cx: &mut TestAppContext) {
    let first = vault();
    let second = fixture(&[("other.md", "Other\n")]);
    let window = open(cx, first.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let root = second.root.to_string_lossy().into_owned();
    window
        .update(visual, |view, _, cx| {
            view.service
                .update(cx, |service, cx| service.connect(root, cx));
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let paths: Vec<_> = view.notes.iter().map(|note| note.path.as_str()).collect();
            assert_eq!(paths, ["other.md"]);
            assert!(view.selected.is_none(), "the previous vault's note is gone");
            assert_eq!(view.graph.read(cx).shown_paths(), ["other.md"]);
        })
        .unwrap();
}

#[gpui::test]
fn the_tree_and_note_panel_resize_by_drag_and_keep_their_width(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    let before = window.update(visual, |view, _, _| view.widths).unwrap();

    for (handle, shift) in [
        ("knowledge-resize-tree", 60.),
        ("knowledge-resize-panel", 40.),
    ] {
        let start = visual.debug_bounds(handle).unwrap().center();
        let end = start + point(px(shift), px(0.));
        visual.simulate_mouse_down(start, gpui::MouseButton::Left, Default::default());
        visual.simulate_mouse_move(end, Some(gpui::MouseButton::Left), Default::default());
        visual.simulate_mouse_up(end, gpui::MouseButton::Left, Default::default());
        visual.run_until_parked();
    }

    let after = window.update(visual, |view, _, _| view.widths).unwrap();
    assert_eq!(after.tree, before.tree + 60.);
    assert_eq!(after.panel, before.panel + 40.);
    assert_eq!(
        super::super::panes::load(&vault.data),
        after,
        "widths persist"
    );
}

#[gpui::test]
fn knowledge_opens_with_the_tree_open_folders_folded_and_no_note(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open_fresh(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-graph").is_some());
    assert!(
        visual.debug_bounds("knowledge-list").is_some(),
        "the tree starts open"
    );
    assert!(
        visual.debug_bounds("knowledge-panel").is_none(),
        "no note opens by itself"
    );

    assert!(visual.debug_bounds("knowledge-folder-0").is_some());
    assert!(
        visual.debug_bounds("knowledge-note-1").is_none(),
        "folders start folded"
    );

    window
        .update(visual, |view, _, cx| {
            assert!(view.graph.read(cx).selected_path().is_none());
            view.on_graph(&GraphEvent::Select("notes/deep/beta.md".into()), cx);
            assert!(view.expanded.contains("notes") && view.expanded.contains("notes/deep"));
            assert_eq!(
                view.graph.read(cx).selected_path(),
                Some("notes/deep/beta.md")
            );
        })
        .unwrap();
    visual.run_until_parked();
    let close = visual.debug_bounds("knowledge-close-note").unwrap();
    visual.simulate_click(close.center(), Default::default());
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            assert!(
                view.graph.read(cx).selected_path().is_none(),
                "a closed note is not a focus"
            );
        })
        .unwrap();
}

#[gpui::test]
fn checkboxes_toggle_the_note_on_disk_and_footer_and_callouts_fold(cx: &mut TestAppContext) {
    let vault = fixture(&[(
        "wants.md",
        "# Wants\n- [ ] Camera\n- [x] Lens ✅ 2026-03-15\n> [!tip]- Hidden\n> - [ ] folded task\n",
    )]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();

    let first = visual.debug_bounds("knowledge-task-0").unwrap();
    visual.simulate_click(first.center(), Default::default());
    visual.run_until_parked();
    let disk = std::fs::read_to_string(vault.root.join("wants.md")).unwrap();
    assert!(disk.contains("- [x] Camera"), "{disk}");
    let second = visual.debug_bounds("knowledge-task-1").unwrap();
    visual.simulate_click(second.center(), Default::default());
    visual.run_until_parked();
    let disk = std::fs::read_to_string(vault.root.join("wants.md")).unwrap();
    assert!(disk.contains("- [ ] Lens"), "{disk}");

    assert!(
        visual.debug_bounds("knowledge-task-2").is_none(),
        "the callout starts folded"
    );
    let title = visual.debug_bounds("knowledge-callout-title-1").unwrap();
    visual.simulate_click(title.center(), Default::default());
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-task-2").is_some());

    assert!(
        visual.debug_bounds("knowledge-relations").is_none(),
        "links start folded"
    );
    let footer = visual.debug_bounds("knowledge-relations-toggle").unwrap();
    visual.simulate_click(footer.center(), Default::default());
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-relations").is_some());
}

#[gpui::test]
fn vault_images_highlights_and_tags_render_and_tags_search(cx: &mut TestAppContext) {
    let vault = fixture(&[
        (
            "Trips/madeira.md",
            "# Madeira\n![[cliff.png|320]]\n![[nowhere.png]]\nRemember ==sunscreen== #travel/portugal\n> [!note] Album\n> ![](cliff.png)\n",
        ),
        ("Trips/attachments/cliff.png", "not really a png"),
        ("other.md", "Tagged #travel\n"),
    ]);
    let window = open(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            view.open_note("Trips/madeira.md".into(), cx);
        })
        .unwrap();
    visual.run_until_parked();

    window
        .update(visual, |view, _, cx| {
            let images: Vec<(Option<std::path::PathBuf>, Option<f32>)> = view
                .preview_blocks
                .iter()
                .flat_map(|block| match block {
                    super::super::document::PreviewBlock::Image { path, width, .. } => {
                        vec![(path.clone(), *width)]
                    }
                    super::super::document::PreviewBlock::Callout { body, .. } => body
                        .iter()
                        .filter_map(|inner| match inner {
                            super::super::document::PreviewBlock::Image { path, width, .. } => {
                                Some((path.clone(), *width))
                            }
                            _ => None,
                        })
                        .collect(),
                    _ => Vec::new(),
                })
                .collect();
            assert_eq!(
                images.len(),
                2,
                "the missing embed stays text; the callout image counts"
            );
            assert!(
                images[0]
                    .0
                    .as_ref()
                    .unwrap()
                    .ends_with("Trips/attachments/cliff.png")
            );
            assert_eq!(images[0].1, Some(320.));
            assert!(
                view.prepared.contains("![[nowhere.png]]") || view.prepared.contains("nowhere.png")
            );

            view.search_tag("travel", cx);
            assert!(view.tree_open);
            assert_eq!(view.filter.read(cx).content.as_ref(), "travel");
        })
        .unwrap();
    visual.run_until_parked();
    window
        .update(visual, |view, _, cx| {
            let mut paths = view.graph.read(cx).shown_paths();
            paths.sort();
            assert_eq!(paths, ["Trips/madeira.md", "other.md"]);
        })
        .unwrap();
}

#[gpui::test]
fn the_tree_toggle_hides_and_shows_the_tree(cx: &mut TestAppContext) {
    let vault = vault();
    let window = open_fresh(cx, vault.data.clone());
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    for open in [false, true] {
        let toggle = visual.debug_bounds("knowledge-tree-toggle").unwrap();
        visual.simulate_click(toggle.center(), Default::default());
        visual.run_until_parked();
        assert_eq!(visual.debug_bounds("knowledge-list").is_some(), open);
        window
            .update(visual, |view, _, _| assert_eq!(view.tree_open, open))
            .unwrap();
    }
}
