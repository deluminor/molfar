use super::super::*;
use super::Fixture;

fn sample() -> VaultSnapshot {
    VaultSnapshot {
        connection: VaultConnection {
            id: "v1".into(),
            root: "/vault".into(),
            name: "Brain".into(),
        },
        entries: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
        notes: vec![
            VaultNote {
                path: "Ideas/Molfar.md".into(),
                title: "Molfar".into(),
                aliases: Vec::new(),
                tags: vec!["ai".into()],
                links: vec![VaultLink {
                    target: "Tailscale".into(),
                    kind: "wiki".into(),
                }],
            },
            VaultNote {
                path: "Tailscale.md".into(),
                title: "Tailscale".into(),
                aliases: Vec::new(),
                tags: Vec::new(),
                links: Vec::new(),
            },
            VaultNote {
                path: "Daily.md".into(),
                title: "Daily".into(),
                aliases: Vec::new(),
                tags: Vec::new(),
                links: vec![VaultLink {
                    target: "Ideas/Molfar".into(),
                    kind: "wiki".into(),
                }],
            },
        ],
    }
}

#[test]
fn index_and_read_match_the_phone_payload() {
    let snapshot = sample();
    let index = shape_index(&snapshot);
    let paths: Vec<_> = index["notes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["path"].as_str().unwrap())
        .collect();
    assert_eq!(paths, ["Daily.md", "Ideas/Molfar.md", "Tailscale.md"]);
    assert_eq!(
        index["notes"][1]["links"],
        serde_json::json!([{ "target": "Tailscale", "path": "Tailscale.md" }])
    );
    let document = VaultDocument {
        path: "Ideas/Molfar.md".into(),
        body: "See [[Tailscale]]".into(),
        revision: "r".into(),
    };
    assert_eq!(
        shape_note(&snapshot, "Ideas/Molfar.md", &document).unwrap(),
        serde_json::json!({
            "path": "Ideas/Molfar.md",
            "title": "Molfar",
            "tags": ["ai"],
            "body": "See [[Tailscale]]",
            "truncated": false,
            "revision": "r",
            "links": [{ "target": "Tailscale", "path": "Tailscale.md" }],
            "backlinks": [{ "path": "Daily.md", "title": "Daily" }],
        })
    );
}

#[test]
fn long_bodies_and_large_indexes_are_capped() {
    let mut snapshot = sample();
    snapshot.notes.clear();
    for index in 0..NOTES_MAX + 1 {
        snapshot.notes.push(VaultNote {
            path: format!("n{index:05}.md"),
            title: format!("{index}"),
            aliases: Vec::new(),
            tags: Vec::new(),
            links: Vec::new(),
        });
    }
    let shaped = shape_index(&snapshot);
    assert_eq!(shaped["notes"].as_array().unwrap().len(), NOTES_MAX);
    assert_eq!(shaped["truncated"], true);
    let snapshot = sample();
    let document = VaultDocument {
        path: "Ideas/Molfar.md".into(),
        body: "a".repeat(BODY_MAX),
        revision: "r".into(),
    };
    assert_eq!(
        shape_note(&snapshot, "Ideas/Molfar.md", &document).unwrap()["truncated"],
        false
    );
    let document = VaultDocument {
        path: "Ideas/Molfar.md".into(),
        body: format!("{}я", "a".repeat(BODY_MAX - 1)),
        revision: "r".into(),
    };
    let note = shape_note(&snapshot, "Ideas/Molfar.md", &document).unwrap();
    assert_eq!(note["truncated"], true);
    let body = note["body"].as_str().unwrap();
    assert!(body.ends_with("\n\n…"));
    assert!(body.is_char_boundary(body.find('\n').unwrap()));
}

#[test]
fn missing_notes_and_a_disconnected_vault_use_the_desktop_errors() {
    let snapshot = sample();
    assert_eq!(
        shape_note(
            &snapshot,
            "../etc/passwd",
            &VaultDocument {
                path: "../etc/passwd".into(),
                body: String::new(),
                revision: String::new()
            }
        )
        .unwrap_err(),
        NOT_IN_VAULT
    );
    assert_eq!(disconnected(), serde_json::json!({"connected": false}));
}

#[test]
fn host_write_rejects_a_stale_revision_and_keeps_the_bytes() {
    let vault = Fixture::new();
    let data = Fixture::new();
    vault.write("Tailscale.md", "Original");
    let host = VaultHost::new();
    host.connect(&data.0, &vault.0.to_string_lossy()).unwrap();
    let read = host.companion_read("Tailscale.md").unwrap();
    let revision = read["revision"].as_str().unwrap().to_string();
    let updated = host
        .companion_write("Tailscale.md", "Updated", &revision)
        .unwrap();
    assert_eq!(updated["body"], "Updated");
    assert_ne!(updated["revision"], revision);
    assert_eq!(
        std::fs::read_to_string(vault.0.join("Tailscale.md")).unwrap(),
        "Updated"
    );
    let error = host
        .companion_write("Tailscale.md", "Again", &revision)
        .unwrap_err();
    assert!(error.starts_with("CONFLICT:"));
    assert_eq!(
        std::fs::read_to_string(vault.0.join("Tailscale.md")).unwrap(),
        "Updated"
    );
    assert_eq!(
        host.companion_read("../etc/passwd").unwrap_err(),
        NOT_IN_VAULT
    );
    assert_eq!(
        VaultHost::new().companion_index().unwrap()["connected"],
        false
    );
}
