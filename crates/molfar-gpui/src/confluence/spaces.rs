//! The space switcher's list of visible and hidden spaces.
use gpui::{AnyElement, Context, FontWeight, Role, SharedString, div, prelude::*, px};

use super::View;
use crate::theme::*;

impl View {
    pub(super) fn space_list(&self, cx: &mut Context<Self>) -> AnyElement {
        let visible = self
            .spaces
            .iter()
            .filter(|space| !self.hidden.contains(&space.id))
            .cloned()
            .collect::<Vec<_>>();
        let hidden = self
            .spaces
            .iter()
            .filter(|space| self.hidden.contains(&space.id))
            .cloned()
            .collect::<Vec<_>>();
        div()
            .id("confluence-space-list")
            .role(Role::ListBox)
            .aria_label("Spaces")
            .max_h(px(240.))
            .overflow_y_scroll()
            .mx(px(8.))
            .mb(px(8.))
            .p(px(4.))
            .rounded(px(8.))
            .border_1()
            .border_color(content(0.1))
            .bg(content(0.03))
            .children(visible.into_iter().map(|space| {
                let id = space.id.clone();
                let selector = id.clone();
                let active = self.selected_space.as_deref() == Some(id.as_str());
                div()
                    .h(px(28.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(
                        div()
                            .id(SharedString::from(format!("confluence-space-{id}")))
                            .debug_selector(move || format!("confluence-space-{selector}"))
                            .role(Role::ListBoxOption)
                            .aria_selected(active)
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            .px(px(8.))
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .rounded(px(6.))
                            .cursor_pointer()
                            .text_size(px(12.))
                            .text_color(content(if active { 1. } else { 0.75 }))
                            .hover(|d| d.bg(content(0.06)))
                            .child(
                                div()
                                    .size(px(14.))
                                    .when(active, |d| d.child(icon("check", 14.))),
                            )
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .truncate()
                                    .child(space.title.clone()),
                            )
                            .child(
                                div()
                                    .flex_shrink_0()
                                    .text_size(px(11.))
                                    .text_color(content(0.35))
                                    .child(space.key.clone()),
                            )
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.space_menu = false;
                                this.select_space(Some(id.clone()), false, cx);
                            })),
                    )
                    .child(self.hide_space(space.id, false, cx))
            }))
            .when(!hidden.is_empty(), |menu| {
                menu.child(
                    div()
                        .debug_selector(|| "confluence-hidden-spaces".into())
                        .px(px(8.))
                        .pt(px(8.))
                        .pb(px(4.))
                        .text_size(px(10.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(content(0.4))
                        .child("HIDDEN"),
                )
            })
            .children(hidden.into_iter().map(|space| {
                let selector = space.id.clone();
                div()
                    .h(px(28.))
                    .px(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(
                        div()
                            .debug_selector(move || format!("confluence-hidden-label-{selector}"))
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_size(px(12.))
                            .text_color(content(0.5))
                            .child(space.title),
                    )
                    .child(self.hide_space(space.id, true, cx))
            }))
            .into_any_element()
    }

    fn hide_space(
        &self,
        id: String,
        hidden: bool,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let selector = id.clone();
        let label = if hidden { "Show space" } else { "Hide space" };
        div()
            .id(SharedString::from(format!("confluence-hidden-{id}")))
            .role(Role::Button)
            .aria_label(label)
            .flex_shrink_0()
            .h(px(22.))
            .px(px(6.))
            .flex()
            .items_center()
            .rounded(px(4.))
            .cursor_pointer()
            .text_size(px(11.))
            .text_color(content(0.45))
            .hover(|d| d.bg(content(0.08)).text_color(content(1.)))
            .debug_selector(move || {
                format!(
                    "confluence-{}-{selector}",
                    if hidden { "show" } else { "hide" }
                )
            })
            .child(if hidden { "Show" } else { "Hide" })
            .on_click(cx.listener(move |this, _, _, cx| this.toggle_hidden(id.clone(), cx)))
    }
}
