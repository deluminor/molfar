use super::super::*;

fn entry(path: &str) -> VaultEntry {
    VaultEntry {
        path: path.into(),
        name: path.rsplit('/').next().unwrap().into(),
        is_dir: false,
        is_markdown: path.ends_with(".md"),
    }
}

fn entries() -> Vec<VaultEntry> {
    vec![
        entry("Daily/today.md"),
        entry("Daily/photo.png"),
        entry("attachments/banner.webp"),
        entry("deep/nested/banner.webp"),
        entry("notes.txt"),
    ]
}

#[test]
fn images_resolve_beside_the_note_from_the_root_or_by_name() {
    let entries = entries();
    assert_eq!(
        find_asset(&entries, "Daily/today.md", "photo.png").as_deref(),
        Some("Daily/photo.png")
    );
    assert_eq!(
        find_asset(&entries, "Daily/today.md", "attachments/banner.webp").as_deref(),
        Some("attachments/banner.webp")
    );
    assert_eq!(
        find_asset(&entries, "x.md", "banner.webp").as_deref(),
        Some("attachments/banner.webp")
    );
    assert_eq!(find_asset(&entries, "x.md", "Banner%20Missing.png"), None);
    assert_eq!(
        find_asset(&entries, "x.md", "notes.txt"),
        None,
        "only images embed"
    );
}

#[test]
fn embeds_become_asset_images_with_widths_and_code_is_left_alone() {
    let body = "![[photo.png|300]]\n![Alt](photo.png)\n`![[photo.png]]`\n```\n![[photo.png]]\n```\n![[missing.png]]\n![web](https://x.test/a.png)\n";
    let out = embed_images(body, &entries(), "Daily/today.md");
    let lines: Vec<&str> = out.lines().collect();
    assert_eq!(
        lines[0],
        "![photo.png](molfar-asset:Daily%2Fphoto.png#w=300)"
    );
    assert_eq!(lines[1], "![Alt](molfar-asset:Daily%2Fphoto.png)");
    assert_eq!(lines[2], "`![[photo.png]]`");
    assert_eq!(lines[4], "![[photo.png]]");
    assert_eq!(lines[6], "![[missing.png]]");
    assert_eq!(lines[7], "![web](https://x.test/a.png)");
    assert_eq!(
        asset_target("molfar-asset:Daily%2Fphoto.png#w=300"),
        Some(("Daily/photo.png".into(), Some(300.)))
    );
    assert_eq!(asset_target("molfar-asset:..%2Fsecret.png"), None);
    let prepared = prepare_preview(&out, &[], "Daily/today.md");
    assert!(
        prepared.contains("![Alt](molfar-asset:Daily%2Fphoto.png)"),
        "{prepared}"
    );
}
