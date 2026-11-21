use super::*;
use gpui::{EntityInputHandler, TestAppContext};
use molfar_core::secrets::{Scope, SecretName, request::RequestStatus};
use std::cell::RefCell;
use std::rc::Rc;

fn request() -> SecretRequest {
    SecretRequest {
        request_id: "fixture".into(),
        session: 1,
        agent: "Codex · fixture".into(),
        name: SecretName::parse("FIXTURE_KEY").unwrap(),
        scope: Scope::Project("fixture".into()),
        reason: "Read the fixture.".into(),
        status: RequestStatus::Open,
        time: 1,
    }
}

#[gpui::test]
fn secret_banner_focus_and_keyboard_use_the_same_validated_actions(cx: &mut TestAppContext) {
    let answers = Rc::new(RefCell::new(Vec::new()));
    let window = cx.update(|cx| {
        crate::input::bind(cx);
        cx.open_window(Default::default(), |_, cx| {
            let card = cx.new(|cx| {
                let mut card = SecretRequestCard::new(
                    request(),
                    "Fixture chat".into(),
                    "Fixture project".into(),
                    cx,
                );
                card.focus_on_mount();
                card
            });
            let answers = answers.clone();
            cx.subscribe(&card, move |_, answer: &Answer, _| {
                answers.borrow_mut().push(*answer);
            })
            .detach();
            card
        })
        .unwrap()
    });
    let visual = &mut gpui::VisualTestContext::from_window(window.into(), cx);
    visual.refresh().unwrap();
    for selector in ["secret-request-banner", "save-secret", "cancel-secret"] {
        assert!(visual.debug_bounds(selector).is_some(), "{selector}");
    }
    window
        .update(visual, |card, window, cx| {
            assert!(card.input.focus_handle(cx).is_focused(window));
            assert!(!card.can_save(cx));
        })
        .unwrap();

    visual.simulate_keystrokes("enter");
    assert!(answers.borrow().is_empty());
    window
        .update(visual, |card, window, cx| {
            card.input.update(cx, |input, cx| {
                input.replace_text_in_range(None, "synthetic-secret", window, cx);
            });
        })
        .unwrap();
    visual.refresh().unwrap();
    visual.simulate_keystrokes("enter");
    assert!(matches!(answers.borrow().as_slice(), [Answer::Save]));
    window
        .update(visual, |card, _, cx| {
            assert!(card.take_secret(cx).is_ok());
            assert!(card.input_is_empty(cx));
            card.set_saving(true, cx);
        })
        .unwrap();
    visual.simulate_keystrokes("escape");
    assert!(matches!(answers.borrow().as_slice(), [Answer::Save]));
    window
        .update(visual, |card, _, cx| card.set_saving(false, cx))
        .unwrap();
    visual.simulate_keystrokes("escape");
    assert!(matches!(
        answers.borrow().as_slice(),
        [Answer::Save, Answer::Cancel]
    ));
}

#[cfg(target_os = "macos")]
#[test]
#[ignore = "Native screenshot capture uses Metal"]
fn capture_secret_ui() {
    use crate::settings::{
        ExternalClientRow, ExternalStatus, Preferences, Section, SettingsContext, SettingsView,
    };
    use gpui::{HeadlessAppContext, size};

    let output = std::path::PathBuf::from(std::env::var_os("MOLFAR_SECRET_QA_OUTPUT").unwrap());
    std::fs::create_dir_all(&output).unwrap();
    let mut cx = HeadlessAppContext::with_platform(
        Arc::new(gpui_apple::AppleTextSystem::new()),
        Arc::new(crate::assets::Assets),
        || {
            Ok(Some(Box::new(
                gpui_apple::metal_renderer::MetalHeadlessRenderer::new(),
            )))
        },
    );
    let store = Arc::new(std::sync::Mutex::new(
        molfar_core::store::Store::open(Path::new(":memory:")).unwrap(),
    ));
    let mut summary = locked(&store).unwrap().create("codex", "/fixture").unwrap();
    summary.has_messages = true;
    let chat = cx
        .open_window(size(px(1040.), px(640.)), |_, cx| {
            cx.new(|cx| {
                let mut chat = Conversation::new(summary, store.clone(), cx);
                chat.loaded = true;
                let card = cx.new(|cx| {
                    let mut card = SecretRequestCard::new(
                        request(),
                        "Fixture chat".into(),
                        "Fixture project".into(),
                        cx,
                    );
                    card.focus_on_mount();
                    card
                });
                chat.set_secret_card(Some(card), cx);
                chat
            })
        })
        .unwrap();
    let capture = |cx: &mut HeadlessAppContext, window, file| {
        cx.run_until_parked();
        cx.update_window(window, |_, window, cx| {
            window.draw(cx).clear(cx);
        })
        .unwrap();
        cx.capture_screenshot(window)
            .unwrap()
            .save(output.join(file))
            .unwrap();
    };
    capture(&mut cx, chat.into(), "secret-pending.png");
    cx.update(|cx| {
        chat.update(cx, |chat, _, cx| {
            chat.secret_card
                .as_ref()
                .unwrap()
                .update(cx, |card, cx| card.set_saving(true, cx));
        })
        .unwrap()
    });
    capture(&mut cx, chat.into(), "secret-saving.png");
    cx.update(|cx| {
        chat.update(cx, |chat, _, cx| {
            let mut outcome = request();
            outcome.session = chat.summary.id;
            outcome.status = RequestStatus::Saved;
            outcome.persist(&locked(&store).unwrap()).unwrap();
            chat.set_secret_card(None, cx);
        })
        .unwrap()
    });
    capture(&mut cx, chat.into(), "secret-saved.png");

    let settings = cx
        .open_window(size(px(1100.), px(1160.)), |_, cx| {
            cx.new(|cx| {
                SettingsView::new(
                    Section::Chat,
                    Preferences::default(),
                    SettingsContext {
                        external_mcp: Some(ExternalStatus {
                            clients: vec![ExternalClientRow {
                                id: "fixture".into(),
                                name: "Fixture client".into(),
                                grants: vec![],
                                created_at: 1,
                                resources: vec![],
                                projects: vec!["/fixture".into()],
                            }],
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    cx,
                )
            })
        })
        .unwrap();
    capture(&mut cx, settings.into(), "chat-preference.png");
    cx.update(|cx| {
        settings
            .update(cx, |view, _, cx| view.select_section(Section::Secrets, cx))
            .unwrap()
    });
    capture(&mut cx, settings.into(), "secrets-sidebar.png");
    cx.update(|cx| {
        settings
            .update(cx, |view, _, cx| view.select_section(Section::Mcp, cx))
            .unwrap()
    });
    capture(&mut cx, settings.into(), "external-access.png");
}

#[gpui::test]
fn restored_secret_outcome_can_be_dismissed_without_removing_history(cx: &mut TestAppContext) {
    let store = Arc::new(std::sync::Mutex::new(
        molfar_core::store::Store::open(Path::new(":memory:")).unwrap(),
    ));
    let mut summary = locked(&store).unwrap().create("codex", "/fixture").unwrap();
    summary.has_messages = true;
    let id = summary.id;
    let mut outcome = request();
    outcome.session = id;
    outcome.persist(&locked(&store).unwrap()).unwrap();
    let window = cx.update(|cx| {
        cx.open_window(Default::default(), |_, cx| {
            cx.new(|cx| {
                let mut chat = Conversation::new(summary, store.clone(), cx);
                chat.loaded = true;
                chat.refresh_secret_notices(cx);
                chat
            })
        })
        .unwrap()
    });
    cx.run_until_parked();
    let visual = &mut gpui::VisualTestContext::from_window(window.into(), cx);
    visual.refresh().unwrap();
    let dismiss = visual.debug_bounds("dismiss-secret-outcome").unwrap();
    visual.simulate_click(dismiss.center(), Default::default());
    window
        .update(visual, |chat, _, cx| chat.refresh_secret_notices(cx))
        .unwrap();
    visual.run_until_parked();
    visual.refresh().unwrap();

    assert!(visual.debug_bounds("secret-outcome-banner").is_none());
    let outcomes = SecretRequest::history(&locked(&store).unwrap(), id).unwrap();
    assert_eq!(outcomes.len(), 1);
    assert_eq!(outcomes[0].status, RequestStatus::Expired);
}
