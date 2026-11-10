use super::super::*;

#[test]
fn tasks_toggle_by_document_order_and_keep_everything_else() {
    let body = "---\ntags: [a]\n---\n# Wants\n- [ ] one\n- [x] two ✅ 2026-03-15\n  - [ ] nested\n";
    let first = toggle_task(body, 0).unwrap();
    assert!(first.contains("- [x] one"));
    assert_eq!(first.len(), body.len());
    let second = toggle_task(body, 1).unwrap();
    assert!(second.contains("- [ ] two ✅ 2026-03-15"));
    let nested = toggle_task(body, 2).unwrap();
    assert!(nested.contains("  - [x] nested"));
    assert!(toggle_task(body, 3).is_none());
}

#[test]
fn fenced_examples_and_frontmatter_are_not_tasks() {
    let body = "---\nlist:\n  - \"[x] yaml\"\n---\n```\n- [ ] code\n```\n> - [ ] quoted\n";
    let toggled = toggle_task(body, 0).unwrap();
    assert!(toggled.ends_with("> - [x] quoted\n"));
    assert!(toggled.contains("- [ ] code") && toggled.contains("\"[x] yaml\""));
    assert!(toggle_task(body, 1).is_none());
}
