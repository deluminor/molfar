//! External clients such as OpenBot reach MOLFAR through these grants; outbound
//! MCP servers above are a separate list.
use super::super::{SettingsEvent, SettingsView};
use crate::settings::widgets::{red, secondary_button};
use crate::theme::*;
use gpui::{AnyElement, ClipboardItem, Context, FontWeight, div, prelude::*, px};
use molfar_core::external_mcp::types::SCOPE;

impl SettingsView {
    pub(super) fn external_mcp_page(&mut self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let status = self.ctx.external_mcp.clone().unwrap_or_default();
        let (enabled, port) = (status.enabled, status.port);
        let mut page = vec![
            div().mt_8().text_size(px(13.)).font_weight(FontWeight::SEMIBOLD).child("External access").into_any_element(),
            div().mt_1().text_size(px(12.)).text_color(content(0.62)).child("Lets a client on this Mac, such as OpenBot, read granted projects, start sessions and add idle Backlog cards over MCP. MOLFAR keeps models, approvals and Board stages. Off by default; only 127.0.0.1 listens.").into_any_element(),
            div()
                .mt_3()
                .flex()
                .gap_2()
                .child(
                    secondary_button("external-mcp-toggle", "Toggle external access", false, false)
                        .child(if enabled { "Turn off" } else { "Turn on" })
                        .on_click(cx.listener(move |_, _, _, cx| {
                            cx.emit(SettingsEvent::ExternalConfigure { enabled: !enabled, port });
                        })),
                )
                .child(
                    secondary_button("external-mcp-port", "Use the next port", false, port == u16::MAX)
                        .child(format!("Port {port} · use {}", port.saturating_add(1)))
                        .on_click(cx.listener(move |_, _, _, cx| {
                            cx.emit(SettingsEvent::ExternalConfigure { enabled, port: port.saturating_add(1) });
                        })),
                )
                .child(
                    secondary_button("external-mcp-add", "Add client", false, false)
                        .child("Add client")
                        .on_click(cx.listener(|_, _, _, cx| cx.emit(SettingsEvent::ExternalCreateClient))),
                )
                .into_any_element(),
        ];
        if let Some(error) = &status.error {
            page.push(
                div()
                    .mt_2()
                    .text_size(px(12.))
                    .text_color(red(0.8))
                    .child(error.clone())
                    .into_any_element(),
            );
        }
        if let Some(endpoint) = &status.endpoint {
            page.push(
                div()
                    .mt_2()
                    .text_size(px(12.))
                    .text_color(content(0.7))
                    .child(format!("Listening · {endpoint}"))
                    .into_any_element(),
            );
        }
        if let Some((name, token)) = status.new_key.clone() {
            page.push(self.external_new_key(name, token, cx));
        }
        for client in status.clients {
            page.push(self.external_client(client, cx));
        }
        page
    }

    fn external_new_key(&self, name: String, token: String, cx: &mut Context<Self>) -> AnyElement {
        div()
            .mt_3()
            .child(div().text_size(px(12.)).text_color(content(0.7)).child(format!("Key for {name}. Copy it into the client's Authorization header as a Bearer token. It is shown only now.")))
            .child(div().mt_1().text_size(px(12.)).font_family("monospace").child(token.clone()))
            .child(
                div()
                    .mt_2()
                    .flex()
                    .gap_2()
                    .child(
                        secondary_button("external-mcp-copy", "Copy key", false, false)
                            .child("Copy key")
                            .on_click(cx.listener(move |_, _, _, cx| {
                                cx.write_to_clipboard(ClipboardItem::new_string(token.clone()));
                            })),
                    )
                    .child(
                        secondary_button("external-mcp-key-done", "Hide key", false, false)
                            .child("Done")
                            .on_click(cx.listener(|_, _, _, cx| cx.emit(SettingsEvent::ExternalDismissKey))),
                    ),
            )
            .into_any_element()
    }

    fn external_client(
        &self,
        client: crate::settings::ExternalClientRow,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let mut scopes = div().mt_1().flex().flex_wrap().gap_2();
        for scope in SCOPE::ALL {
            let (id, on) = (client.id.clone(), client.scopes.contains(&scope));
            scopes = scopes.child(
                secondary_button(
                    format!("external-mcp-{}-{}", client.id, scope.label()),
                    scope.label(),
                    false,
                    false,
                )
                .child(format!("{} {}", if on { "✓" } else { "+" }, scope.label()))
                .on_click(cx.listener(move |_, _, _, cx| {
                    cx.emit(SettingsEvent::ExternalToggleGrant {
                        id: id.clone(),
                        scope: Some(scope),
                        project: None,
                    });
                })),
            );
        }
        let mut projects = div().mt_1().flex().flex_wrap().gap_2();
        for (index, (path, label)) in self.ctx.projects.iter().enumerate() {
            let on = client.projects.iter().any(|granted| {
                molfar_core::files::path_key(granted) == molfar_core::files::path_key(path)
            });
            let (id, project) = (client.id.clone(), path.clone());
            projects = projects.child(
                secondary_button(
                    format!("external-mcp-{}-project-{index}", client.id),
                    label.clone(),
                    false,
                    false,
                )
                .child(format!("{} {label}", if on { "✓" } else { "+" }))
                .on_click(cx.listener(move |_, _, _, cx| {
                    cx.emit(SettingsEvent::ExternalToggleGrant {
                        id: id.clone(),
                        scope: None,
                        project: Some(project.clone()),
                    });
                })),
            );
        }
        let id = client.id.clone();
        div()
            .mt_3()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().text_size(px(13.)).child(client.name.clone()))
                    .child(
                        secondary_button(format!("external-mcp-revoke-{id}"), "Revoke", true, false)
                            .child("Revoke")
                            .on_click(cx.listener(move |_, _, _, cx| cx.emit(SettingsEvent::ExternalRevoke(id.clone())))),
                    ),
            )
            .child(div().mt_1().text_size(px(11.)).text_color(content(0.55)).child("Scopes are independent: results need read; submit starts work and adds cards; stop ends running turns."))
            .child(scopes)
            .child(projects)
            .into_any_element()
    }
}
