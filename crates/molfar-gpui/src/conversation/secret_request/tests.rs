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
