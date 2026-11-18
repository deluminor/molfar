use super::*;
use crate::settings::ExternalClientRow;
use molfar_core::external_mcp::grants::types::{DOMAIN, GRANT};

impl SettingsView {
    pub(super) fn external_permissions(
        &self,
        client: &ExternalClientRow,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let mut matrix = div().flex().flex_col().gap(px(6.));
        for domain in DOMAIN::ALL {
            let sensitive = matches!(domain, DOMAIN::Inbox | DOMAIN::Knowledge);
            matrix = matrix.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(div().w(px(94.)).text_size(px(12.)).child(domain.label()))
                    .child(
                        grant_chip(
                            client,
                            GRANT::Read(domain),
                            if sensitive {
                                "Read · sensitive"
                            } else {
                                "Read"
                            },
                            cx,
                        )
                        .w(px(112.)),
                    )
                    .child(grant_chip(client, GRANT::Write(domain), "Write", cx)),
            );
        }
        let actions = div()
            .flex()
            .flex_wrap()
            .gap(px(6.))
            .child(grant_chip(client, GRANT::BoardCreate, "Board create", cx))
            .child(grant_chip(client, GRANT::BoardRun, "Board run", cx))
            .child(grant_chip(client, GRANT::SessionsStop, "Sessions stop", cx));

        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(section_title("Permissions"))
            .child(matrix)
            .child(actions)
            .child(flag(
                client,
                GRANT::Destructive,
                "Destructive",
                "Allows tools to delete or reset data when available.",
                cx,
            ))
            .child(flag(
                client,
                GRANT::Delegated,
                "Delegated",
                "Allows tools to act as you or another agent when available.",
                cx,
            ))
    }
}

fn grant_chip(
    client: &ExternalClientRow,
    grant: GRANT,
    label: &str,
    cx: &mut Context<SettingsView>,
) -> gpui::Stateful<gpui::Div> {
    let key = String::from(grant);
    chip::chip(
        format!("external-{}-{key}", client.id),
        label.to_owned(),
        client.grants.contains(&grant),
        false,
        SettingsEvent::ExternalToggleGrant {
            id: client.id.clone(),
            grant: Some(grant),
            project: None,
        },
        cx,
    )
    .debug_selector(move || format!("external-grant-{key}"))
}

fn flag(
    client: &ExternalClientRow,
    grant: GRANT,
    label: &str,
    warning: &'static str,
    cx: &mut Context<SettingsView>,
) -> impl IntoElement {
    div()
        .flex()
        .items_center()
        .gap_2()
        .child(grant_chip(client, grant, label, cx))
        .child(
            div()
                .text_size(px(11.))
                .text_color(content(0.62))
                .child(warning),
        )
}

pub(super) fn section_title(title: &'static str) -> gpui::Div {
    div()
        .text_size(px(12.))
        .font_weight(FontWeight::SEMIBOLD)
        .child(title)
}
