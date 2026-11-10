use super::super::*;
use links::LinkResolution;

fn note(path: &str, targets: &[&str], aliases: &[&str]) -> VaultNote {
    VaultNote {
        path: path.into(),
        title: path.into(),
        aliases: aliases.iter().map(|alias| (*alias).to_string()).collect(),
        tags: Vec::new(),
        links: targets
            .iter()
            .map(|target| VaultLink {
                target: (*target).into(),
                kind: "wiki".into(),
            })
            .collect(),
    }
}

fn wiki(target: &str) -> VaultLink {
    VaultLink {
        target: target.into(),
        kind: "wiki".into(),
    }
}

fn markdown(target: &str) -> VaultLink {
    VaultLink {
        target: target.into(),
        kind: "markdown".into(),
    }
}

#[test]
fn resolves_paths_aliases_unicode_headings_and_relative_markdown_targets() {
    let index = links::note_index(&[
        note("Projects/Start.md", &[], &[]),
        note("Projects/Design.md", &[], &["Blueprint"]),
        note("Archive/Design.md", &[], &[]),
        note("Привіт.md", &[], &[]),
    ]);
    assert_eq!(
        links::resolve_vault_link(&index, "Projects/Start.md", &wiki("Design#Heading")),
        LinkResolution::Resolved {
            path: "Projects/Design.md".into()
        }
    );
    assert_eq!(
        links::resolve_vault_link(&index, "Projects/Start.md", &wiki("Blueprint")),
        LinkResolution::Resolved {
            path: "Projects/Design.md".into()
        }
    );
    assert_eq!(
        links::resolve_vault_link(
            &index,
            "Projects/Start.md",
            &markdown("../Привіт.md#^block")
        ),
        LinkResolution::Resolved {
            path: "Привіт.md".into()
        }
    );
    assert_eq!(
        links::resolve_vault_link(&index, "Projects/Start.md", &markdown("#local")),
        LinkResolution::Resolved {
            path: "Projects/Start.md".into()
        }
    );
}

#[test]
fn distinguishes_missing_ambiguous_and_attachments() {
    let index = links::note_index(&[
        note("Projects/Start.md", &[], &[]),
        note("Projects/Design.md", &[], &["Blueprint"]),
        note("Archive/Design.md", &[], &[]),
        note("Привіт.md", &[], &[]),
    ]);
    assert_eq!(
        links::resolve_vault_link(&index, "Root.md", &wiki("Design")),
        LinkResolution::Ambiguous
    );
    assert_eq!(
        links::resolve_vault_link(&index, "Root.md", &wiki("%ZZ")),
        LinkResolution::Missing
    );
    assert_eq!(
        links::resolve_vault_link(&index, "Root.md", &wiki("Absent")),
        LinkResolution::Missing
    );
    assert!(matches!(
        links::resolve_vault_link(&index, "Root.md", &wiki("photo.png")),
        LinkResolution::Attachment { .. }
    ));
}

#[test]
fn resolves_dotted_names_before_treating_them_as_attachments() {
    let index = links::note_index(&[
        note("Archive/2026.10.01.md", &[], &[]),
        note("Release.md", &[], &["v1.2"]),
    ]);
    assert_eq!(
        links::resolve_vault_link(&index, "Root.md", &wiki("2026.10.01")),
        LinkResolution::Resolved {
            path: "Archive/2026.10.01.md".into()
        }
    );
    assert_eq!(
        links::resolve_vault_link(&index, "Root.md", &wiki("v1.2")),
        LinkResolution::Resolved {
            path: "Release.md".into()
        }
    );
    assert!(matches!(
        links::resolve_vault_link(&index, "Root.md", &wiki("v1.3")),
        LinkResolution::Attachment { .. }
    ));
}

#[test]
fn rejects_absolute_and_escaping_paths() {
    assert!(links::normalize_vault_path("../../secret.md").is_none());
    assert!(links::normalize_vault_path("/secret.md").is_none());
    assert!(links::normalize_vault_path("C:/secret.md").is_none());
    assert_eq!(
        links::normalize_vault_path("a/../b.md").as_deref(),
        Some("b.md")
    );
}
