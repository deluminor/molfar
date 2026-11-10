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
            assert!(view.collapsed.contains("notes"));
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
            assert_eq!(view.selected.as_deref(), Some("other.md"));
            assert_eq!(view.graph.read(cx).shown_paths(), ["other.md"]);
        })
        .unwrap();
}
