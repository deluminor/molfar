use super::super::*;

fn notes() -> Vec<VaultNote> {
    vec![
        VaultNote {
            path: "A.md".into(),
            title: "A".into(),
            aliases: Vec::new(),
            tags: Vec::new(),
            links: vec![VaultLink {
                target: "B".into(),
                kind: "wiki".into(),
            }],
        },
        VaultNote {
            path: "B.md".into(),
            title: "B".into(),
            aliases: Vec::new(),
            tags: Vec::new(),
            links: Vec::new(),
        },
    ]
}

#[test]
fn resolved_wiki_links_become_vault_urls_and_missing_links_stay_text() {
    let prepared = prepare_preview(
        "See [[B|Bee]] and [[Missing]] and [B](B.md).\n",
        &notes(),
        "A.md",
    );
    assert!(prepared.contains("[Bee](molfar-vault:B.md)"));
    assert!(prepared.contains("[B](molfar-vault:B.md)"));
    assert!(prepared.contains("Missing"));
    assert!(!prepared.contains("molfar-vault:Missing"));
    assert_eq!(vault_target("molfar-vault:B.md").as_deref(), Some("B.md"));
    assert!(vault_target("molfar-vault:../B.md").is_none());
}

#[test]
fn fenced_and_inline_code_keep_raw_wiki_links() {
    let body = "```\n[[B]]\n```\n`[[B]]` [[B]]\n";
    let prepared = prepare_preview(body, &notes(), "A.md");
    assert!(prepared.contains("```\n[[B]]\n```"));
    assert!(prepared.contains("`[[B]]`"));
    assert!(prepared.contains("[B](molfar-vault:B.md)"));
}
