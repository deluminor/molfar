use super::*;
use molfar_core::transcript::Row;

#[gpui::test]
fn companion_transcript_keeps_history_and_revision(cx: &mut gpui::TestAppContext) {
    let (window, _, id) = crate::shell::tests::window(cx);
    window.update(cx, |shell, _, cx| {
        let mut rows = Vec::new();
        for turn in 0..5 {
            for (role, text) in [("user", format!("Prompt {turn}")), ("assistant", format!("Reply {turn}"))] {
                rows.push(Row { role: role.into(), text, first: true, sent_at: None });
            }
        }
        locked(&shell.store).unwrap().write_rows(id, 0, &rows).unwrap();
        shell.sessions.remove(&id);
        let input = json!({"sessionId": id.to_string(), "limit": 20});
        let page = shell.companion_action("session.transcript", &input, cx).unwrap();
        assert_eq!(page["blocks"].as_array().unwrap().len(), 10);
        assert_eq!(page["blocks"][0]["text"], "Prompt 0");
        assert_eq!(page["blocks"][9]["text"], "Reply 4");
        let tail = shell.companion_action("session.transcript", &json!({"sessionId": id.to_string(), "limit": 2}), cx).unwrap();
        assert_eq!(tail["blocks"].as_array().unwrap().len(), 2);
        assert_eq!(tail["truncated"], true);
        let unchanged = shell.companion_action("session.transcript", &json!({"sessionId": id.to_string(), "limit": 20, "ifRevision": page["revision"]}), cx).unwrap();
        assert_eq!(unchanged["unchanged"], true);
    }).unwrap();
}

#[gpui::test]
fn companion_uses_familiar_session_id_and_live_owner(cx: &mut gpui::TestAppContext) {
    let (window, _, id) = crate::shell::tests::window(cx);
    let manager = window
        .read_with(cx, |shell, _| shell.familiars.clone().unwrap())
        .unwrap();
    manager.update(cx, |manager, cx| {
        manager
            .roster
            .familiars
            .push(molfar_core::familiar::Familiar {
                id: "companion-familiar".into(),
                session_id: Some(id),
                name: "Fixture".into(),
                ..Default::default()
            });
        manager.mobile_chat("companion-familiar", cx);
    });
    cx.run_until_parked();
    let chat = manager.read_with(cx, |manager, _| {
        manager.open_chat("companion-familiar").unwrap()
    });
    chat.update(cx, |chat, cx| {
        let mut settings = chat.settings.clone();
        settings.model = Some("fixture-model".into());
        settings.access = AccessMode::Auto;
        chat.install_transfer(settings, None, cx);
        chat.busy = true;
        chat.transcript.update(cx, |transcript, cx| {
            transcript.patch(
                0,
                vec![Row {
                    role: "assistant".into(),
                    text: "Live reply".into(),
                    first: true,
                    sent_at: None,
                }],
                cx,
            )
        });
    });
    window
        .update(cx, |shell, _, cx| {
            shell.sessions.remove(&id);
            let page = shell
                .companion_action(
                    "familiar.transcript",
                    &json!({"familiarId":"companion-familiar"}),
                    cx,
                )
                .unwrap();
            assert_eq!(page["sessionId"], id.to_string());
            assert_eq!(page["busy"], true);
            assert_eq!(page["model"], "fixture-model");
            assert_eq!(page["runtimeMode"], "auto");
            assert_eq!(page["blocks"][0]["text"], "Live reply");
            let view = shell
                .companion_view(&json!({"sessionId":id.to_string()}), cx)
                .unwrap();
            assert_eq!(view.entity_id(), chat.entity_id());
            shell
                .companion_action(
                    "session.mode",
                    &json!({"sessionId":id.to_string(),"runtimeMode":"full-access"}),
                    cx,
                )
                .unwrap();
            assert_eq!(chat.read(cx).settings.access, AccessMode::FullAccess);
            let overview = shell.companion_action("overview", &json!({}), cx).unwrap();
            assert!(
                overview["familiars"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|familiar| familiar["id"] == "companion-familiar"
                        && familiar["status"] == "working")
            );
        })
        .unwrap();
}

#[gpui::test]
fn companion_overview_reports_saved_settings_for_unloaded_sessions(cx: &mut gpui::TestAppContext) {
    let (window, _, id) = crate::shell::tests::window(cx);
    window
        .update(cx, |shell, _, cx| {
            let settings = molfar_core::agent::Settings {
                access: AccessMode::FullAccess,
                model: Some("saved-model".into()),
                ..Default::default()
            };
            locked(&shell.store)
                .unwrap()
                .save_agent_settings(id, &settings)
                .unwrap();
            shell.sessions.remove(&id);

            let overview = shell.companion_overview(cx).unwrap();
            let session = overview["sessions"]
                .as_array()
                .unwrap()
                .iter()
                .find(|session| session["id"].as_str() == Some(id.to_string().as_str()))
                .unwrap();

            assert_eq!(session["runtimeMode"], AccessMode::FullAccess.id());
            assert_eq!(session["model"], "saved-model");
        })
        .unwrap();
}

#[gpui::test]
fn companion_pairing_failures_reach_the_user_and_stale_offers_clear(cx: &mut gpui::TestAppContext) {
    let (window, _, _) = crate::shell::tests::window(cx);
    let root = std::env::temp_dir().join(format!("companion-shell-{}", uuid::Uuid::new_v4()));
    let (host, _jobs) = Host::open(root.join("companion.json")).unwrap();
    let offer = crate::companion::Offer {
        code: "CODE".into(),
        url: "https://fixture.ts.net".into(),
        link: "bitchain://molfar/pair".into(),
        expires_at: u64::MAX,
    };
    window
        .update(cx, |shell, _, cx| {
            shell.companion = Some(host.clone());

            assert!(shell.companion_pair(cx).is_none());
            assert!(
                shell
                    .error
                    .as_deref()
                    .is_some_and(|error| error.contains("Turn on"))
            );

            shell.companion_offer = Some(offer.clone());
            assert_eq!(shell.companion_live_offer(), Some(offer.clone()));
            shell.companion_offer = Some(crate::companion::Offer {
                expires_at: 1,
                ..offer.clone()
            });
            assert_eq!(shell.companion_live_offer(), None);

            shell.companion_offer = Some(offer.clone());
            shell.companion_configure(false, 3775, cx);
            assert_eq!(shell.companion_offer, None);
        })
        .unwrap();
    host.shutdown();
    std::fs::remove_dir_all(root).ok();
}
