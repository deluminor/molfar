use super::*;
use crate::settings::widgets::{icon_action, red};
use gpui::{ClipboardItem, rgb};

const EMERALD: u32 = 0x10b981;

impl SettingsView {
    pub(super) fn external_header(
        &self,
        status: &ExternalStatus,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let (enabled, port) = (status.enabled, status.port);
        let (label, color) = if status.error.is_some() {
            ("Error", red(0.95))
        } else if status.endpoint.is_some() {
            ("Listening", rgb(EMERALD).into())
        } else {
            ("Off", content(0.55))
        };
        let pill = div()
            .id("external-status")
            .debug_selector(move || format!("external-status-{label}"))
            .flex()
            .items_center()
            .gap_1()
            .rounded_full()
            .px_2()
            .py_1()
            .bg(content(0.07))
            .text_size(px(11.))
            .text_color(content(0.82))
            .child(div().size(px(6.)).rounded_full().bg(color))
            .child(label);
        let mut header = div().mt_8().flex().flex_col().gap_2().child(
            div()
                .flex()
                .justify_between()
                .items_center()
                .child(
                    div()
                        .text_size(px(13.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("External access"),
                )
                .child(
                    div().flex().items_center().gap_2().child(pill).child(
                        secondary_button(
                            "external-mcp-toggle",
                            "Toggle external access",
                            false,
                            false,
                        )
                        .child(if enabled { "Turn off" } else { "Turn on" })
                        .on_click(cx.listener(move |_, _, _, cx| {
                            cx.emit(SettingsEvent::ExternalConfigure {
                                enabled: !enabled,
                                port,
                            });
                        })),
                    ),
                ),
        );
        if let Some(error) = &status.error {
            header = header.child(
                div()
                    .text_size(px(12.))
                    .text_color(red(0.8))
                    .child(error.clone()),
            );
        }
        let endpoint = status.endpoint.clone();
        if let Some(endpoint) = endpoint {
            header = header.child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(
                        div()
                            .font_family("monospace")
                            .text_size(px(12.))
                            .child(endpoint.clone()),
                    )
                    .child(
                        icon_action(
                            "external-mcp-copy-endpoint",
                            "Copy endpoint",
                            "copy",
                            24.,
                            13.,
                            0.65,
                            false,
                        )
                        .on_click(move |_, _, cx| {
                            cx.write_to_clipboard(ClipboardItem::new_string(endpoint.clone()))
                        }),
                    ),
            );
        }
        if enabled {
            header = header.child(
                self.external_editor(&editor::Target::Port, cx)
                    .unwrap_or_else(|| {
                        secondary_button("external-mcp-port", "Change port", false, false)
                            .border_0()
                            .text_size(px(11.))
                            .child(format!("Port {port} · Change"))
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.open_external_editor(
                                    editor::Target::Port,
                                    &port.to_string(),
                                    window,
                                    cx,
                                );
                            }))
                            .into_any_element()
                    }),
            );
        }

        header.into_any_element()
    }
}
