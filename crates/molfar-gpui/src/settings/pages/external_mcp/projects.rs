use super::*;
use crate::settings::ExternalClientRow;

const VISIBLE_PROJECTS: usize = 8;

impl SettingsView {
    pub(super) fn external_projects(
        &self,
        client: &ExternalClientRow,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let projects: Vec<_> = self
            .ctx
            .projects
            .iter()
            .filter(|(path, _)| molfar_core::remote::parse_remote_path(path).is_none())
            .collect();
        let expanded = self.external_page.expanded_projects.contains(&client.id);
        let limit = if expanded {
            projects.len()
        } else {
            VISIBLE_PROJECTS
        };
        let mut chips = div().flex().flex_wrap().gap(px(6.));
        for (index, (path, label)) in projects.iter().take(limit).enumerate() {
            let key = molfar_core::files::path_key(path);
            let on = client
                .projects
                .iter()
                .any(|path| molfar_core::files::path_key(path) == key);
            chips = chips.child(chip::chip(
                format!("external-{}-project-{index}", client.id),
                label.clone(),
                on,
                false,
                SettingsEvent::ExternalToggleGrant {
                    id: client.id.clone(),
                    grant: None,
                    project: Some(path.clone()),
                },
                cx,
            ));
        }
        if projects.len() > VISIBLE_PROJECTS {
            let id = client.id.clone();
            let label = if expanded {
                "Show fewer".into()
            } else {
                format!("+{} more", projects.len() - VISIBLE_PROJECTS)
            };
            chips = chips.child(
                secondary_button("external-more", label.clone(), false, false)
                    .debug_selector(move || {
                        if expanded {
                            "external-projects-expanded".into()
                        } else {
                            "external-projects-collapsed".into()
                        }
                    })
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if !this.external_page.expanded_projects.remove(&id) {
                            this.external_page.expanded_projects.insert(id.clone());
                        }
                        cx.notify();
                    })),
            );
        }
        let choices = [("All", true), ("None", false)].map(|(label, all)| {
            let id = client.id.clone();
            secondary_button(label, label, false, false)
                .border_0()
                .child(label)
                .on_click(cx.listener(move |_, _, _, cx| {
                    cx.emit(SettingsEvent::ExternalSetProjects {
                        id: id.clone(),
                        all,
                    });
                }))
        });

        div()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(permissions::section_title("Projects"))
                    .child(div().flex().children(choices)),
            )
            .child(chips)
    }
}
