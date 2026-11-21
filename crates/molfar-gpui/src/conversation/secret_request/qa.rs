use super::*;
use crate::settings::{
    self, ExternalClientRow, ExternalStatus, Preferences, Section, SettingsContext, SettingsView,
};
use gpui::{HeadlessAppContext, size};
use molfar_core::secrets::{Scope, SecretName, SecretStore, request::RequestStatus};

struct SettingsCapture {
    section: Section,
    body: Entity<SettingsView>,
}

impl Render for SettingsCapture {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let search = self.body.update(cx, |view, cx| view.search_field(true, cx));
        div()
            .flex()
            .size_full()
            .child(div().w(px(220.)).flex_shrink_0().child(settings::nav(
                self.section,
                search,
                |_, _, _| {},
                |_, _| {},
            )))
            .child(div().min_w_0().flex_1().h_full().child(self.body.clone()))
    }
}

#[test]
#[ignore = "Native screenshot capture uses Metal"]
fn capture_secret_ui() {
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
    let request = SecretRequest {
        request_id: "fixture".into(),
        session: summary.id,
        agent: "Codex · Fixture model".into(),
        name: SecretName::parse("FIXTURE_KEY").unwrap(),
        scope: Scope::Project("fixture".into()),
        reason: "Read the fixture.".into(),
        status: RequestStatus::Open,
        time: 1,
    };
    let chat = cx
        .open_window(size(px(940.), px(420.)), |_, cx| {
            cx.new(|cx| {
                let mut chat = Conversation::new(summary, store.clone(), cx);
                chat.loaded = true;
                chat.status.clear();
                let mut transcript = molfar_core::transcript::Transcript::default();
                transcript.begin("user");
                transcript.append("Read the fixture.");
                chat.transcript
                    .update(cx, |view, cx| view.patch(0, transcript.rows, cx));
                let card = cx.new(|cx| {
                    let mut card = SecretRequestCard::new(
                        request.clone(),
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
        cx.update_window(window, |_, window, cx| window.draw(cx).clear(cx))
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
            let mut outcome = request;
            outcome.status = RequestStatus::Saved;
            outcome.persist(&locked(&store).unwrap()).unwrap();
            chat.set_secret_card(None, cx);
        })
        .unwrap()
    });
    capture(&mut cx, chat.into(), "secret-saved.png");

    for (section, file) in [
        (Section::Chat, "chat-preference.png"),
        (Section::Secrets, "secrets-sidebar.png"),
        (Section::Mcp, "external-access.png"),
    ] {
        let settings = cx
            .open_window(size(px(1280.), px(1100.)), |_, cx| {
                let body = cx.new(|cx| {
                    let mut view = SettingsView::new(
                        section,
                        Preferences {
                            notifications: false,
                            ..Default::default()
                        },
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
                    );
                    view.stop_fixture_discovery();
                    if section == Section::Secrets {
                        view.attach_secret_store(store.clone(), SecretStore::in_memory(), cx);
                    }
                    view
                });
                cx.new(|_| SettingsCapture { section, body })
            })
            .unwrap();
        capture(&mut cx, settings.into(), file);
    }
}
