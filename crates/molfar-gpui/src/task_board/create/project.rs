use super::Board;
use crate::popover::{Menu, MenuAction, MenuEvent};
use gpui::{AppContext, Context, Window};

impl Board {
    pub(super) fn open_create_project(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(draft) = self.creation.as_ref() else {
            return;
        };
        if draft.busy {
            return;
        }
        let items = self
            .projects
            .iter()
            .filter(|path| !path.starts_with("remote://"))
            .map(|path| MenuAction::new(path.clone(), path.clone()).into())
            .collect();
        let selected = draft.project.clone();
        let menu = cx.new(|cx| {
            Menu::new("Board project", items, window, cx)
                .width(440.)
                .select_value(&selected)
        });
        let subscription =
            cx.subscribe_in(&menu, window, |this, _, event: &MenuEvent, window, cx| {
                if let Some(draft) = &mut this.creation {
                    if let MenuEvent::Picked(project, _) = event {
                        draft.project = project.to_string();
                    }
                    draft.project_menu = None;
                    window.focus(&draft.project_focus, cx);
                }
                cx.notify();
            });
        if let Some(draft) = &mut self.creation {
            draft.project_menu = Some(menu);
            draft.project_subscription = Some(subscription);
        }
        cx.notify();
    }
}
