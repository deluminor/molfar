use super::*;
use crate::settings::{ExternalClientRow, ExternalResource};
use molfar_core::external_mcp::grants::types::RESOURCE;

impl SettingsView {
    pub(super) fn external_resources(
        &self,
        client: &ExternalClientRow,
        options: &[ExternalResource],
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let mut groups = div()
            .flex()
            .flex_col()
            .gap_2()
            .child(permissions::section_title("Resources"));
        for (kind, heading, empty) in [
            (RESOURCE::Vault, "Knowledge vault", "No vault connected"),
            (RESOURCE::InboxProvider, "Inbox providers", "No providers"),
            (RESOURCE::Familiar, "Familiars", "No Familiars available"),
        ] {
            let mut row = div().flex().flex_wrap().gap(px(6.));
            let mut found = false;
            for option in options.iter().filter(|option| option.grant.kind == kind) {
                found = true;
                let granted = client.resources.contains(&option.grant);
                let label = match option.connected {
                    Some(true) => format!("{} · Connected", option.label),
                    Some(false) => format!("{} · Disconnected", option.label),
                    None => option.label.clone(),
                };
                let id = format!(
                    "external-resource-{}-{:?}-{}",
                    client.id, kind, option.grant.id
                );
                let selector = format!("external-resource-{:?}-{}", kind, option.grant.id);
                row = row.child(
                    chip::chip(
                        id,
                        label,
                        granted,
                        false,
                        SettingsEvent::ExternalToggleResource {
                            id: client.id.clone(),
                            resource: option.grant.clone(),
                        },
                        cx,
                    )
                    .debug_selector(move || selector.clone()),
                );
            }
            if !found {
                row = row.child(
                    div()
                        .text_size(px(12.))
                        .text_color(content(0.5))
                        .child(empty),
                );
            }
            groups = groups.child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(
                        div()
                            .text_size(px(11.))
                            .text_color(content(0.62))
                            .child(heading),
                    )
                    .child(row),
            );
        }
        groups
    }
}
