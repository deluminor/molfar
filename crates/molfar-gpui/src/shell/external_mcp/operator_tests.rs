use super::tests::{Fixture, call, fixture, principal, window};
use super::*;
use gpui::TestAppContext;
use molfar_core::external_mcp::tools::sessions::{OPERATOR_REQUIRED, SEND, START};

fn reserve_session(fixture: &Fixture, args: &Value) -> i64 {
    locked(&fixture.store)
        .unwrap()
        .create_app_session(
            "external:client",
            args["requestId"].as_str().unwrap(),
            &receipts::digest(START, args),
            "codex",
            &fixture.granted,
        )
        .unwrap()
        .0
        .id
}

fn stub_provider(fixture: &Fixture, args: &Value) -> crate::runtime::test_provider::Registration {
    let session = reserve_session(fixture, args);
    crate::runtime::test_provider::Registration::new(
        &fixture.store,
        session,
        fixture.root.join("absent-provider"),
    )
}

#[gpui::test]
fn external_operator_is_opt_in_and_receipts_keep_the_launch_flag(cx: &mut TestAppContext) {
    let fixture = fixture();
    let args =
        |request: &str| json!({"project":fixture.granted,"prompt":"Fixture","requestId":request});
    let _providers =
        ["ordinary", "operator", "with-pref-off"].map(|id| stub_provider(&fixture, &args(id)));
    let window = window(&fixture, cx);
    let ordinary = principal(&fixture);
    let mut privileged = ordinary.clone();
    privileged.grants.push(GRANT::SessionsOperator);
    let mut explicit = args("start-denied");
    explicit["operator"] = json!(true);
    let count = locked(&fixture.store).unwrap().sessions().unwrap().len();
    assert_eq!(
        call(window, &ordinary, START, explicit, cx).unwrap_err(),
        OPERATOR_REQUIRED
    );
    assert_eq!(
        locked(&fixture.store).unwrap().sessions().unwrap().len(),
        count
    );

    let first = call(window, &ordinary, START, args("ordinary"), cx).unwrap();
    assert_eq!(first["operator"], false);
    let first = call(window, &privileged, START, args("operator"), cx).unwrap();
    assert_eq!(first["operator"], true);
    let session = first["sessionId"].as_i64().unwrap();
    cx.update(|cx| {
        cx.set_global(crate::settings::Preferences {
            start_in_operator: false,
            ..Default::default()
        });
    });
    assert_eq!(
        call(window, &privileged, START, args("operator"), cx).unwrap(),
        first
    );
    let mut changed = args("operator");
    changed["operator"] = json!(true);
    assert!(
        call(window, &privileged, START, changed, cx)
            .unwrap_err()
            .contains("different input")
    );
    assert_eq!(
        call(window, &privileged, START, args("with-pref-off"), cx).unwrap()["operator"],
        false
    );
    assert_eq!(
        call(
            window,
            &ordinary,
            SEND,
            json!({"sessionId":session,"prompt":"Continue","requestId":"follow-up-denied"}),
            cx
        )
        .unwrap_err(),
        OPERATOR_REQUIRED
    );

    let db = locked(&fixture.store).unwrap();
    assert!(
        db.agent_settings(session)
            .unwrap()
            .unwrap()
            .operator_enabled
    );
    let entries = db.external_audit_log().unwrap();
    assert!(
        entries
            .iter()
            .any(|entry| entry.request_id.as_deref() == Some("start-denied")
                && entry.operator == Some(false)
                && entry.outcome == "denied")
    );
    assert_eq!(
        entries
            .iter()
            .filter(|entry| entry.request_id.as_deref() == Some("operator")
                && entry.outcome == "ok"
                && entry.operator == Some(true))
            .count(),
        2
    );
}

#[gpui::test]
fn a_pending_operator_reservation_requires_the_grant_after_restart(cx: &mut TestAppContext) {
    let fixture = fixture();
    let args = json!({"project":fixture.granted,"prompt":"Fixture","requestId":"recover"});
    let target = ReceiptTarget::Project(fixture.granted.clone());
    let digest = receipts::digest(START, &args);
    let _provider = stub_provider(&fixture, &args);
    let count = {
        let db = locked(&fixture.store).unwrap();
        assert_eq!(
            db.external_receipt_reserve("client", &target, START, "recover", &digest, Some(true))
                .unwrap(),
            (BEGIN::Fresh, Some(true))
        );
        db.sessions().unwrap().len()
    };
    let window = window(&fixture, cx);
    let ordinary = principal(&fixture);
    assert_eq!(
        call(window, &ordinary, START, args.clone(), cx).unwrap_err(),
        OPERATOR_REQUIRED
    );
    assert_eq!(
        locked(&fixture.store).unwrap().sessions().unwrap().len(),
        count
    );
    cx.update(|cx| {
        cx.set_global(crate::settings::Preferences {
            start_in_operator: false,
            ..Default::default()
        })
    });
    let mut granted = ordinary;
    granted.grants.push(GRANT::SessionsOperator);
    assert_eq!(
        call(window, &granted, START, args, cx).unwrap()["operator"],
        true
    );
}

#[cfg(unix)]
mod bridge;
