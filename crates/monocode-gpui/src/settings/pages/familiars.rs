use crate::settings::SettingsView;
use crate::{
    settings::{SettingsEvent, management::Target, widgets::icon_action},
    theme::*,
};
use gpui::{AnyElement, Context, SharedString, div, prelude::*, px};
impl SettingsView {
    pub(super) fn familiars_page(&mut self, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let p = self.prefs.clone();
        let mut rows=vec![
            self.row(Some("familiars-enabled"),true,"Show familiars",Some("Agents of your own on the project rail. Each works on the projects you give it, remembers what matters and picks up habits it runs on its own. Turn this off to hide them.".into()),vec![self.toggle("familiars-enabled","Show familiars",p.familiars,false,cx,|this,on,cx|this.update(cx,|p|p.familiars=on))]),
            self.row(Some("rail-familiars-pinned"),false,"Pin familiars to the icon rail",Some("When the project rail is collapsed to icons, show each Familiar at the top of the rail, above a divider, instead of inside the project picker.".into()),vec![self.toggle("rail-familiars-pinned","Pin familiars to the icon rail",p.rail_familiars_pinned,!p.familiars,cx,|this,on,cx|this.update(cx,|p|p.rail_familiars_pinned=on))])];
        if cfg!(target_os = "macos") {
            rows.push(self.row(Some("familiar-menu-bar-icon"),false,"Menu bar icon",Some("Chat with a Familiar or open the quick composer from the macOS menu bar. Turn this off to hide the icon.".into()),vec![self.toggle("familiar-menu-bar-icon","Menu bar icon",p.familiar_menu_bar_icon,false,cx,|this,on,cx|this.update(cx,|p|p.familiar_menu_bar_icon=on))]));
        }
        let mut roster = Vec::new();
        for (ix, familiar) in self.ctx.familiars.clone().into_iter().enumerate() {
            let show_id = familiar.id.clone();
            let show = familiar.show;
            let folders = familiar.folders;
            let description = match familiar.projects.split_last() {
                None => "No projects yet".to_owned(),
                Some((last, [])) => format!("Works on {last}"),
                Some((last, others)) => format!("Works on {} and {last}", others.join(", ")),
            };
            let label = div()
                .min_w_0()
                .flex()
                .items_center()
                .gap_2()
                .child(
                    div()
                        .debug_selector(|| "settings-familiar-mascot".into())
                        .size(px(16.))
                        .flex_shrink_0()
                        .child(crate::familiars::avatar::avatar(
                            &familiar.mascot,
                            familiar.color,
                            "idle",
                            16.,
                            true,
                        )),
                )
                .child(
                    div()
                        .debug_selector(|| "settings-familiar-name".into())
                        .min_w_0()
                        .truncate()
                        .child(familiar.name.clone()),
                );
            let reset = familiar.clone();
            let controls = vec![
                div()
                    .text_size(px(12.))
                    .line_height(px(20.))
                    .text_color(content(0.5))
                    .child("Show Familiar spawned session on the sidebar")
                    .into_any_element(),
                div()
                    .debug_selector(|| "settings-familiar-sidebar-switch".into())
                    .flex_shrink_0()
                    .child(self.toggle(
                        "familiar-sidebar-show",
                        format!("Show sessions started by {} in sidebar", familiar.name),
                        show,
                        false,
                        cx,
                        move |_, on, cx| {
                            cx.emit(SettingsEvent::FamiliarSidebar(show_id.clone(), on, folders))
                        },
                    ))
                    .into_any_element(),
                icon_action(
                    "reset-familiar",
                    format!("Reset {} to defaults", familiar.name),
                    "rotate-ccw",
                    28.,
                    14.,
                    0.4,
                    false,
                )
                .debug_selector(|| "settings-familiar-reset".into())
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_management(Target::ResetFamiliar(reset.clone()), window, cx)
                }))
                .into_any_element(),
            ];
            roster.push(
                div()
                    .id(SharedString::from(format!("settings-familiar-{}", familiar.id)))
                    .child(self.row(None, ix == 0, label, Some(description.into()), controls))
                    .into_any_element(),
            );
        }
        if roster.is_empty() {
            roster.push(super::super::widgets::note("No familiars yet."));
        }
        vec![self.group(None,true,"Familiars",None,None,rows),self.group(Some("familiar-list"),false,"Your familiars",Some("Show or hide sessions started by each Familiar. Hidden sessions remain available from the Familiar's chat.".into()),None,roster)]
    }
}
