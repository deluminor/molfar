use super::{
    Home,
    layout::{model::WidgetId, state::LayoutState},
};
use crate::{task_board::controls, theme::*};
use gpui::{AnyElement, Context, Role, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn start_editing(&mut self, cx: &mut Context<Self>) {
        self.editing = true;
        self.views.sphere_motion.borrow_mut().set_editing(true);
        self.views.brand.update(cx, |_, cx| cx.notify());
        cx.notify();
    }

    pub(super) fn finish_editing(&mut self, cx: &mut Context<Self>) {
        self.editing = false;
        self.views.sphere_motion.borrow_mut().set_editing(false);
        self.views.brand.update(cx, |_, cx| cx.notify());
        cx.notify();
    }

    pub(super) fn reset_layout(&mut self, cx: &mut Context<Self>) {
        let brand = self.state.brand;
        self.state = LayoutState {
            brand,
            ..LayoutState::default()
        };
        self.views.sphere_motion.borrow_mut().resume();
        self.save(cx);
    }

    pub(super) fn hide_widget(&mut self, id: WidgetId, cx: &mut Context<Self>) {
        if self.state.hide(id) {
            if id == WidgetId::Brand {
                self.views.sphere_motion.borrow_mut().pause();
            }
            if id == WidgetId::Host {
                self.feeds.host.reset_baseline = true;
            }
            self.save(cx);
        }
    }

    pub(super) fn show_widget(&mut self, id: WidgetId, cx: &mut Context<Self>) {
        self.state.show(id);
        if id == WidgetId::Brand {
            self.views.sphere_motion.borrow_mut().resume();
        }
        if id == WidgetId::Host {
            self.feeds.host.reset_baseline = true;
        }
        self.save(cx);
    }

    pub(super) fn card_actions(&self, id: WidgetId, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.editing {
            return None;
        }
        let enabled = self.state.can_hide(id);
        let selector = format!("home-hide-{}", id.key());
        Some(
            div()
                .id(SharedString::from(selector.clone()))
                .debug_selector(move || selector.clone())
                .role(Role::Button)
                .aria_label(format!("Hide {}", id.label()))
                .size(px(18.))
                .flex()
                .items_center()
                .justify_center()
                .rounded_sm()
                .text_color(content(0.5))
                .when(enabled, |button| {
                    button
                        .cursor_pointer()
                        .hover(|style| style.bg(content(0.08)).text_color(content(1.)))
                        .on_click(cx.listener(move |this, _, _, cx| this.hide_widget(id, cx)))
                })
                .when(!enabled, |button| {
                    button.opacity(0.35).tooltip(|_, cx| {
                        controls::hint("At least one widget must stay visible", cx)
                    })
                })
                .child(icon("x", 11.))
                .into_any_element(),
        )
    }

    pub(super) fn hidden_strip(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let mut strip = div()
            .id("home-hidden-widgets")
            .debug_selector(|| "home-hidden-widgets".into())
            .flex_shrink_0()
            .flex()
            .flex_wrap()
            .items_center()
            .gap_1p5()
            .px_4()
            .pt_3()
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(content(0.5))
                    .mr_1()
                    .child("Hidden"),
            );
        for id in WidgetId::ALL
            .into_iter()
            .filter(|id| self.state.is_hidden(*id))
        {
            let selector = format!("home-show-{}", id.key());
            strip = strip.child(
                controls::ghost_button(SharedString::from(selector.clone()), id.label())
                    .debug_selector(move || selector.clone())
                    .aria_label(format!("Show {}", id.label()))
                    .gap_1()
                    .border_1()
                    .border_dashed()
                    .border_color(content(0.15))
                    .child(icon("plus", 11.))
                    .on_click(cx.listener(move |this, _, _, cx| this.show_widget(id, cx))),
            );
        }
        strip
    }
}
