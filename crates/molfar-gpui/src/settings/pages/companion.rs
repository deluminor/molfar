//! BitChain Companion controls. The phone keeps using Tailscale Serve on 3775.
use super::super::{SettingsEvent, SettingsView};
use crate::settings::widgets::{red, secondary_button};
use crate::theme::*;
use gpui::{AnyElement, Context, FontWeight, div, prelude::*, px};

impl SettingsView {
    pub(super) fn companion_page(&mut self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let Some(status) = self.ctx.companion.clone() else {
            return Vec::new();
        };
        let enabled = status.enabled;
        let port = status.port;
        let mut page = vec![
            div()
                .mt_8()
                .text_size(px(13.))
                .font_weight(FontWeight::SEMIBOLD)
                .child("Companion")
                .into_any_element(),
            div()
                .mt_1()
                .text_size(px(12.))
                .text_color(content(0.62))
                .child("BitChain reaches this Mac through Tailscale. Turn it on here when this is the app the phone should drive. The desktop MOLFAR app uses the same pairing file and the same port.")
                .into_any_element(),
        ];
        page.push(
            secondary_button("companion-toggle", "Toggle Companion", false, false)
                .mt_3()
                .child(if enabled { "Turn off" } else { "Turn on" })
                .on_click(cx.listener(move |_, _, _, cx| {
                    cx.emit(SettingsEvent::CompanionConfigure {
                        enabled: !enabled,
                        port,
                    });
                }))
                .into_any_element(),
        );
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
        if enabled {
            if let Some(url) = &status.effective_url {
                page.push(
                    div()
                        .mt_2()
                        .text_size(px(12.))
                        .text_color(content(0.7))
                        .child(format!("Phone address · {url}"))
                        .into_any_element(),
                );
            }
            page.push(
                secondary_button("companion-pair", "Pair a device", false, !status.running)
                    .mt_3()
                    .child("Pair a device")
                    .on_click(cx.listener(|_, _, _, cx| cx.emit(SettingsEvent::CompanionPair)))
                    .into_any_element(),
            );
        }
        if let Some(offer) = &self.ctx.companion_offer {
            page.push(
                div()
                    .mt_3()
                    .text_size(px(18.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(offer.code.clone())
                    .into_any_element(),
            );
            page.push(
                div()
                    .mt_1()
                    .text_size(px(12.))
                    .text_color(content(0.65))
                    .child(offer.link.clone())
                    .into_any_element(),
            );
            page.push(
                secondary_button("companion-cancel-pair", "Cancel pairing", false, false)
                    .mt_2()
                    .child("Cancel code")
                    .on_click(
                        cx.listener(|_, _, _, cx| cx.emit(SettingsEvent::CompanionCancelPair)),
                    )
                    .into_any_element(),
            );
        }
        for device in status.devices {
            let id = device.id.clone();
            page.push(
                div()
                    .mt_2()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().text_size(px(13.)).child(device.name.clone()))
                    .child(
                        secondary_button(format!("companion-revoke-{id}"), "Remove", true, false)
                            .child("Remove")
                            .on_click(cx.listener(move |_, _, _, cx| {
                                cx.emit(SettingsEvent::CompanionRevoke(id.clone()));
                            })),
                    )
                    .into_any_element(),
            );
        }
        page
    }
}
