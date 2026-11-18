mod chip;
mod client_card;
mod editor;
mod header;
mod new_key;
mod permissions;
mod projects;
#[cfg(test)]
mod tests;

use super::super::{ExternalStatus, SettingsEvent, SettingsView};
use crate::{
    settings::widgets::{accent, secondary_button},
    theme::*,
};
use gpui::{AnyElement, Context, FontWeight, Task, div, prelude::*, px};
use std::collections::HashSet;

#[derive(Default)]
pub(in crate::settings) struct ExternalPageState {
    editor: Option<editor::Editor>,
    confirm_revoke: Option<String>,
    expanded_projects: HashSet<String>,
    copied_reset: Option<Task<()>>,
}

impl SettingsView {
    pub(super) fn external_mcp_page(&mut self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let status = self.ctx.external_mcp.clone().unwrap_or_default();
        let default_name = status.default_name.clone();
        let mut page = vec![
            self.external_header(&status, cx),
            div().text_size(px(12.)).text_color(content(0.62))
                .child("Let local MCP clients on this Mac access granted projects. MOLFAR keeps control of models, approvals and Board stages. The server starts off and listens only on 127.0.0.1.")
                .into_any_element(),
            div().mt_3().flex().justify_between().items_center()
                .child(div().text_size(px(12.)).font_weight(FontWeight::SEMIBOLD)
                    .child(format!("Clients ({})", status.clients.len())))
                .child(secondary_button("external-mcp-add", "Add client", false, false)
                    .debug_selector(|| "external-mcp-add".into())
                    .child("Add client")
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_external_editor(editor::Target::Add, &default_name, window, cx);
                    })))
                .into_any_element(),
        ];
        if let Some(form) = self.external_editor(&editor::Target::Add, cx) {
            page.push(form);
        }
        if status.clients.is_empty() {
            page.push(
                div()
                    .text_size(px(12.))
                    .text_color(content(0.55))
                    .id("external-empty")
                    .debug_selector(|| "external-empty".into())
                    .child("No clients yet. Add one to issue a key.")
                    .into_any_element(),
            );
        }
        for client in &status.clients {
            page.push(self.external_client(client, status.new_key.as_ref(), cx));
        }

        page
    }
}
