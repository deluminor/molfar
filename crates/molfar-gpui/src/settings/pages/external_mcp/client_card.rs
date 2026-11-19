use super::*;
use crate::settings::{ExternalClientRow, ExternalResource, widgets::icon_action};
use gpui::SharedString;

impl SettingsView {
    pub(super) fn external_client(
        &self,
        client: &ExternalClientRow,
        key: Option<&(String, String)>,
        resources: &[ExternalResource],
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let id = client.id.clone();
        let name = client.name.clone();
        let target = editor::Target::Rename(id.clone());
        let title = self.external_editor(&target, cx).unwrap_or_else(|| {
            div()
                .flex()
                .items_center()
                .gap_1()
                .child(
                    div()
                        .text_size(px(13.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(client.name.clone()),
                )
                .child(
                    icon_action(
                        "external-rename",
                        "Rename client",
                        "pencil",
                        22.,
                        12.,
                        0.55,
                        false,
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_external_editor(
                            editor::Target::Rename(id.clone()),
                            &name,
                            window,
                            cx,
                        );
                    })),
                )
                .into_any_element()
        });
        let meta = client_meta(client);
        let banner = key
            .filter(|(name, _)| *name == client.name)
            .map(|(name, token)| self.external_new_key(name, token, cx));
        div()
            .id(SharedString::from(client.id.clone()))
            .flex()
            .flex_col()
            .gap_3()
            .mt_2()
            .p_3()
            .rounded_lg()
            .border_1()
            .border_color(content(0.08))
            .bg(content(0.035))
            .children(banner)
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap_2()
                    .child(
                        div().flex_1().min_w_0().child(title).child(
                            div()
                                .text_size(px(11.))
                                .text_color(content(0.55))
                                .child(meta),
                        ),
                    )
                    .child(self.external_revoke_control(client, cx)),
            )
            .child(self.external_permissions(client, cx))
            .child(self.external_projects(client, cx))
            .child(self.external_resources(client, resources, cx))
            .into_any_element()
    }

    fn external_revoke_control(
        &self,
        client: &ExternalClientRow,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let id = client.id.clone();
        if self.external_page.confirm_revoke.as_deref() != Some(&id) {
            return secondary_button("external-revoke", "Revoke client", true, false)
                .border_0()
                .debug_selector(|| "external-revoke".into())
                .child("Revoke")
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.external_page.confirm_revoke = Some(id.clone());
                    cx.notify();
                }))
                .into_any_element();
        }

        div()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .text_size(px(11.))
                    .child("Revoke this client? Its key stops working at once."),
            )
            .child(
                div()
                    .flex()
                    .gap_1()
                    .child(
                        secondary_button("external-revoke-cancel", "Cancel revoke", false, false)
                            .child("Cancel")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.external_page.confirm_revoke = None;
                                cx.notify();
                            })),
                    )
                    .child(
                        secondary_button("external-revoke-confirm", "Confirm revoke", true, false)
                            .debug_selector(|| "external-revoke-confirm".into())
                            .child("Revoke")
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.external_page.confirm_revoke = None;
                                cx.emit(SettingsEvent::ExternalRevoke(id.clone()));
                                cx.notify();
                            })),
                    ),
            )
            .into_any_element()
    }
}

fn client_meta(client: &ExternalClientRow) -> String {
    let mut details = Vec::new();
    if let Some(date) = chrono::DateTime::from_timestamp_millis(client.created_at) {
        details.push(format!(
            "Created {}",
            date.with_timezone(&chrono::Local).format("%-d %b")
        ));
    }
    details.push(format!("{} grants", client.grants.len()));
    details.push(format!("{} projects", client.projects.len()));
    if !client.resources.is_empty() {
        details.push(format!("{} resources", client.resources.len()));
    }
    details.join(" · ")
}
