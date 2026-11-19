use super::*;
use gpui::ClipboardItem;
use std::time::Duration;

impl SettingsView {
    pub(super) fn external_new_key(
        &self,
        name: &str,
        token: &str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let token = token.to_owned();
        let copied = self.external_page.copied_reset.is_some();
        div()
            .flex()
            .flex_col()
            .gap_2()
            .p_3()
            .rounded_md()
            .border_1()
            .border_color(accent(0.55))
            .bg(accent(0.1))
            .child(
                div()
                    .text_size(px(12.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(format!("Key for {name} — shown once")),
            )
            .child(
                div()
                    .w_full()
                    .truncate()
                    .rounded_md()
                    .border_1()
                    .border_color(accent(0.22))
                    .px_2()
                    .py_1()
                    .font_family("monospace")
                    .text_size(px(12.))
                    .child(token.clone()),
            )
            .child(
                div()
                    .flex()
                    .gap_2()
                    .child(
                        secondary_button("external-mcp-copy-key", "Copy key", false, false)
                            .child(if copied { "Copied" } else { "Copy" })
                            .on_click(cx.listener(move |this, _, _, cx| {
                                cx.write_to_clipboard(ClipboardItem::new_string(token.clone()));
                                this.external_page.copied_reset =
                                    Some(cx.spawn(async move |this, cx| {
                                        cx.background_executor()
                                            .timer(Duration::from_millis(1500))
                                            .await;
                                        let _ = this.update(cx, |this, cx| {
                                            this.external_page.copied_reset = None;
                                            cx.notify();
                                        });
                                    }));
                                cx.notify();
                            })),
                    )
                    .child(
                        secondary_button("external-mcp-key-done", "Hide key", false, false)
                            .debug_selector(|| "external-mcp-key-done".into())
                            .child("Done")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.external_page.copied_reset = None;
                                cx.emit(SettingsEvent::ExternalDismissKey);
                            })),
                    ),
            )
            .into_any_element()
    }
}
