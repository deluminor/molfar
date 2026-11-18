use super::tests::{call, fixture, principal, window};
use super::*;
use gpui::TestAppContext;
use molfar_core::external_mcp::{
    grants::types::{DOMAIN, GRANT, RESOURCE, ResourceGrant},
    resources::vault_resource_id,
};

#[gpui::test]
fn vault_access_needs_both_grants_and_audit_omits_note_text(cx: &mut TestAppContext) {
    let f = fixture();
    let path = f.root.join("vault");
    std::fs::create_dir(&path).unwrap();
    let path = path.canonicalize().unwrap();
    std::fs::write(path.join("note.md"), "original").unwrap();
    let window = window(&f, cx);
    let vault = window
        .update(cx, |shell, _, cx| shell.ensure_vault(cx))
        .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        vault.update(cx, |vault, cx| {
            vault.connect(path.display().to_string(), cx)
        })
    });
    cx.run_until_parked();

    let mut client = principal(&f);
    let read = json!({"path":"note.md"});
    client.resources.push(ResourceGrant {
        kind: RESOURCE::Vault,
        id: vault_resource_id(path.to_str().unwrap()),
    });
    assert!(call(window, &client, "knowledge_read", read.clone(), cx).is_err());
    let grant = client.resources.pop().unwrap();
    client.grants.push(GRANT::Read(DOMAIN::Knowledge));
    assert_eq!(
        call(window, &client, "knowledge_read", read.clone(), cx),
        Err("Vault not found.".into())
    );

    client.resources.push(grant);
    let note = call(window, &client, "knowledge_read", read, cx).unwrap();
    assert_eq!(note["body"], "original");
    client.grants.push(GRANT::Write(DOMAIN::Knowledge));
    let body = "private body for this test";
    let written = call(
        window,
        &client,
        "knowledge_write",
        json!({
            "path":"note.md","body":body,"expected":note["revision"],"requestId":"edit"
        }),
        cx,
    )
    .unwrap();
    assert!(written.get("body").is_none());
    assert_eq!(std::fs::read_to_string(path.join("note.md")).unwrap(), body);

    let audit = locked(&f.store).unwrap().external_audit_log().unwrap();
    assert!(
        audit.iter().any(|entry| entry.outcome == "denied"
            && entry.target.as_deref() == Some("knowledge:note.md"))
    );
    assert!(
        audit
            .iter()
            .any(|entry| entry.outcome == "ok" && entry.request_id.as_deref() == Some("edit"))
    );
    assert!(!serde_json::to_string(&audit).unwrap().contains(body));
}

#[gpui::test]
fn familiar_private_content_requires_read_and_the_same_familiar(cx: &mut TestAppContext) {
    use molfar_core::{
        familiar::{self, Roster},
        transcript::Transcript,
    };
    let f = fixture();
    let id = {
        let mut store = locked(&f.store).unwrap();
        let mut roster = Roster::default();
        let id = roster.create(vec![]).id.clone();
        roster.get_mut(&id).unwrap().session_id = Some(f.sessions.0);
        roster.save(&store).unwrap();
        familiar::files::save(
            &familiar::root(&store),
            &id,
            None,
            "MEMORY.md",
            "private memory",
            None,
        )
        .unwrap();
        let mut transcript = Transcript::default();
        transcript.begin("user");
        transcript.append("private conversation");
        store.write_rows(f.sessions.0, 0, &transcript.rows).unwrap();
        id
    };
    let window = window(&f, cx);
    let mut client = principal(&f);
    client.grants.push(GRANT::Write(DOMAIN::Familiars));
    let included = json!({"familiarId":id,"include":["memory","transcript"]});
    let grant = ResourceGrant {
        kind: RESOURCE::Familiar,
        id: id.clone(),
    };
    client.resources.push(grant.clone());
    assert!(call(window, &client, "familiars_read", included.clone(), cx).is_err());
    client.resources.clear();
    client.grants.push(GRANT::Read(DOMAIN::Familiars));
    assert_eq!(
        call(window, &client, "familiars_read", included.clone(), cx),
        Err("Familiar not found.".into())
    );

    client.resources.push(grant);
    let profile = call(
        window,
        &client,
        "familiars_read",
        json!({"familiarId":id}),
        cx,
    )
    .unwrap();
    assert!(profile.get("memory").is_none() && profile.get("transcript").is_none());
    let private = call(window, &client, "familiars_read", included, cx).unwrap();
    assert_eq!(private["memory"]["body"], "private memory");
    assert!(
        private["transcript"]
            .to_string()
            .contains("private conversation")
    );
    assert!(private.get("projects").is_none() && private.get("subsessions").is_none());

    for tool in ["familiars_send", "familiars_reset", "familiars_delete"] {
        let mut input = json!({"familiarId":id,"requestId":"flag"});
        if tool == "familiars_send" {
            input["text"] = json!("do not enqueue");
        }
        assert!(
            call(window, &client, tool, input, cx)
                .unwrap_err()
                .contains("lacks permission")
        );
    }
    for key in [
        "subsessions",
        "addPath",
        "removePaths",
        "projects",
        "appAccess",
    ] {
        let mut input = json!({"familiarId":id,"requestId":"invalid"});
        input[key] = json!("forbidden");
        assert!(tools::validate("familiars_update", &input).is_err());
    }
}
