use super::Board;
use crate::{
    popover::{Anchor, Menu, MenuAction, MenuEvent, menu_popover},
    theme::*,
};
use gpui::{AnyElement, AppContext, Context, Role, Window, div, prelude::*, px};
use molfar_core::task_board::constants::{FINAL_REVIEW, IDLE, PLAN_APPROVAL};

impl Board {
    pub(crate) fn set_appearances(
        &mut self,
        appearances: std::collections::HashMap<
            String,
            molfar_core::project_appearance::ProjectAppearance,
        >,
    ) {
        self.appearances = appearances;
    }

    pub(super) fn project_appearance(
        &self,
        path: &str,
    ) -> molfar_core::project_appearance::ProjectAppearance {
        self.appearances.get(path).cloned().unwrap_or_default()
    }

    pub(super) fn project_filter(&self, cx: &mut Context<Self>) -> AnyElement {
        let label = self
            .project_filter
            .as_deref()
            .map(|path| self.project_appearance(path).label(path))
            .unwrap_or_else(|| "All projects".to_owned());
        div()
            .child(self.project_anchor.probe())
            .child(
                super::controls::ghost_button("board-project-filter", label.to_owned())
                    .debug_selector(|| "board-project-filter".into())
                    .role(Role::Button)
                    .aria_label("Filter by project")
                    .aria_keyshortcuts("P")
                    .border_1()
                    .border_color(content(0.1))
                    .gap_2()
                    .max_w(px(190.))
                    .min_w_0()
                    .truncate()
                    .when_some(self.project_filter.as_ref(), |d, path| {
                        d.child(crate::project_settings::project_icon(
                            &self.project_appearance(path),
                            path,
                            14.,
                        ))
                    })
                    .when(self.project_filter.is_none(), |d| {
                        d.child(icon("dashboard", 12.))
                    })
                    .child(icon("chevron-down", 12.))
                    .on_click(cx.listener(|this, _, window, cx| this.open_projects(window, cx))),
            )
            .into_any_element()
    }

    fn open_projects(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let mut items = vec![
            MenuAction::new("", "All projects")
                .icon("dashboard")
                .checked(self.project_filter.is_none())
                .into(),
        ];
        let mut projects = self.projects.clone();
        if !self.cwd.is_empty() && !projects.contains(&self.cwd) {
            projects.push(self.cwd.clone());
        }
        projects.sort();
        projects.dedup();
        for project in projects {
            let appearance = self.project_appearance(&project);
            let mut action = MenuAction::new(project.clone(), appearance.label(&project))
                .checked(self.project_filter.as_ref() == Some(&project));
            action.project = Some((appearance, project));
            items.push(action.into());
        }
        let menu = cx.new(|cx| Menu::new("Projects", items, window, cx).width(260.));
        self.project_subscription =
            Some(
                cx.subscribe_in(&menu, window, |this, _, event: &MenuEvent, window, cx| {
                    this.project_menu = None;
                    if let MenuEvent::Picked(value, _) = event {
                        this.project_filter = (!value.is_empty()).then(|| value.to_string());
                        this.project_only = false;
                        cx.emit(super::Event::ProjectFilter(this.project_filter.clone()));
                        this.reset_detail_artifact();
                        this.snapshot = None;
                        this.refresh(cx);
                    }
                    window.focus(&this.focus, cx);
                    cx.notify();
                }),
            );
        self.project_menu = Some(menu);
        cx.notify();
    }

    pub(super) fn project_overlay(
        &self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let menu = self.project_menu.as_ref()?;
        Some(
            crate::modal::window_overlay(
                window,
                div().absolute().inset_0().child(menu_popover(
                    menu,
                    Anchor::Slot(self.project_anchor.clone()),
                    cx,
                )),
            )
            .into_any_element(),
        )
    }

    pub(super) fn attention_summary(&self) -> AnyElement {
        let count = self.snapshot.as_ref().map_or(0, |s| {
            s.cards
                .iter()
                .filter(|c| {
                    !c.archived
                        && c.run_state == IDLE
                        && matches!(c.column_id.as_str(), PLAN_APPROVAL | FINAL_REVIEW)
                })
                .count()
        });
        div()
            .flex()
            .items_center()
            .gap_1()
            .text_size(px(11.))
            .text_color(super::kanban::look::amber(1.))
            .when(count > 0, |d| {
                d.child(icon("circle-alert", 12.))
                    .child(format!("{count} waiting on you"))
            })
            .into_any_element()
    }
}
