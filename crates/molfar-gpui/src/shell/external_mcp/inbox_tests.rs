use super::{
    domains::inbox::backend::ExternalInbox,
    tests::{call, fixture, principal, window},
    *,
};
use gpui::TestAppContext;
use molfar_core::{
    external_mcp::grants::types::{DOMAIN, GRANT, RESOURCE, ResourceGrant},
    inbox::{Details, Diff, Item, Snapshot, Status, Thread},
};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

#[derive(Default)]
struct Backend {
    posts: AtomicUsize,
}

fn item(provider: &str) -> Item {
    Item {
        provider: provider.into(),
        id: "t-1".into(),
        number: 1,
        kind: "issue".into(),
        repo: "repo/name".into(),
        title: "Work item".into(),
        url: "https://user:secret@example.test/items/1?token=secret".into(),
        project_path: "/private/project".into(),
        ..Default::default()
    }
}

impl ExternalInbox for Backend {
    fn connected(&self, _: &str) -> Result<bool, String> {
        Ok(true)
    }

    fn list(&self, _: &[PathBuf], _: &[&str]) -> Snapshot {
        let status = Status {
            connected: true,
            url: "https://private.example.test".into(),
            email: "private@example.test".into(),
            site: "private-site".into(),
            organization: "private-org".into(),
            ..Default::default()
        };
        Snapshot {
            items: vec![item("github"), item("jira")],
            connections: [("github".into(), status.clone()), ("jira".into(), status)].into(),
            ..Default::default()
        }
    }

    fn comment(&self, _: &Item, _: String, _: String) -> Result<(), String> {
        self.posts.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn details(&self, _: &Item) -> Result<Details, String> {
        Ok(Details::default())
    }

    fn diff(&self, _: &Item) -> Result<Diff, String> {
        Ok(Diff::default())
    }

    fn thread(&self, _: &Item) -> Result<Thread, String> {
        Ok(Thread::default())
    }
}

#[gpui::test]
fn inbox_access_filters_providers_and_pending_comments_never_post_again(cx: &mut TestAppContext) {
    let f = fixture();
    let window = window(&f, cx);
    let backend = Arc::new(Backend::default());
    window
        .update(cx, |shell, _, _| {
            shell.external.inbox_backend = Some(backend.clone())
        })
        .unwrap();
    let mut client = principal(&f);
    client
        .grants
        .extend([GRANT::Read(DOMAIN::Inbox), GRANT::Write(DOMAIN::Inbox)]);
    client.resources.push(ResourceGrant {
        kind: RESOURCE::InboxProvider,
        id: "github".into(),
    });

    let listed = call(window, &client, "inbox_list", json!({}), cx).unwrap();
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["url"], "https://example.test/items/1");
    for forbidden in [
        "secret",
        "private.example",
        "email",
        "organization",
        "site",
        "projectPath",
    ] {
        assert!(!listed.to_string().contains(forbidden));
    }
    assert_eq!(
        call(
            window,
            &client,
            "inbox_details",
            json!({"itemKey":item("jira").key()}),
            cx
        ),
        Err("Inbox item not found.".into())
    );

    let tool = "inbox_comment";
    let body = "private comment for this test";
    let target = item("github");
    let input = json!({"itemKey":target.key(),"body":body,"requestId":"interrupted"});
    assert!(
        call(window, &client, tool, input.clone(), cx)
            .unwrap_err()
            .contains("lacks permission")
    );
    assert_eq!(backend.posts.load(Ordering::SeqCst), 0);
    client.grants.push(GRANT::Delegated);
    let pending = locked(&f.store)
        .unwrap()
        .external_receipt_begin(
            &client.client_id,
            &ReceiptTarget::Resource {
                kind: RESOURCE::InboxProvider,
                id: "github".into(),
            },
            tool,
            "interrupted",
            &receipts::digest(tool, &input),
        )
        .unwrap();
    assert_eq!(pending, BEGIN::Fresh);
    backend
        .comment(&target, body.into(), String::new())
        .unwrap();
    assert_eq!(
        call(window, &client, tool, input, cx),
        Err(OUTCOME_UNKNOWN.into())
    );
    assert_eq!(backend.posts.load(Ordering::SeqCst), 1);

    let input = json!({"itemKey":target.key(),"body":body,"requestId":"fresh"});
    assert_eq!(
        call(window, &client, tool, input.clone(), cx).unwrap()["posted"],
        true
    );
    assert_eq!(
        call(window, &client, tool, input, cx).unwrap()["posted"],
        true
    );
    assert_eq!(backend.posts.load(Ordering::SeqCst), 2);
    let audit = locked(&f.store).unwrap().external_audit_log().unwrap();
    assert!(
        audit
            .iter()
            .any(|entry| entry.outcome == "unknown" && entry.action == tool)
    );
    assert!(
        audit
            .iter()
            .any(|entry| entry.outcome == "denied" && entry.action == "inbox_details")
    );
    assert!(!serde_json::to_string(&audit).unwrap().contains(body));
}
