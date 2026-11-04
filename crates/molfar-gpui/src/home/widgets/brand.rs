use super::{super::Home, parts::mono};
use crate::{home::layout::state::BrandVisual, theme::*};
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};

impl Home {
    pub(super) fn brand_picker(&self, cx: &mut Context<Self>) -> AnyElement {
        let current = self.state.brand;
        let mut picker = div().flex().gap_0p5();
        for visual in BrandVisual::ALL {
            let key = visual.key();
            let selected = visual == current;
            picker = picker.child(
                div()
                    .id(SharedString::from(format!("home-brand-pick-{key}")))
                    .debug_selector(move || format!("home-brand-pick-{key}"))
                    .px_1()
                    .rounded_sm()
                    .cursor_pointer()
                    .font_family(mono())
                    .text_size(px(9.))
                    .text_color(if selected {
                        accent_color()
                    } else {
                        content(0.35)
                    })
                    .when(selected, |button| button.bg(accent_color().opacity(0.1)))
                    .hover(|style| style.text_color(content(0.9)))
                    .child(key.to_uppercase())
                    .on_click(cx.listener(move |this, _, _, cx| this.pick_brand(visual, cx))),
            );
        }
        picker.into_any_element()
    }

    fn pick_brand(&mut self, visual: BrandVisual, cx: &mut Context<Self>) {
        if self.state.brand == visual {
            return;
        }
        self.state.brand = visual;
        self.views.brand.update(cx, |brand, cx| {
            brand.visual = visual;
            cx.notify();
        });
        self.save(cx);
    }
}
