use crate::input::Input;
use crate::theme::content;
use gpui::{App, AppContext, Entity, Focusable, Window};

/// The owner-written task inputs, shared by the create and edit dialogs.
pub(in crate::task_board) struct TaskFields {
    pub title: Entity<Input>,
    pub description: Entity<Input>,
    pub criteria: Entity<Input>,
    pub base: Entity<Input>,
}

impl TaskFields {
    pub(in crate::task_board) fn new(cx: &mut App) -> Self {
        let title = cx.new(|cx| Input::field("Title", "What needs to be done?", content(0.35), cx));
        let description = cx.new(|cx| {
            Input::multiline_field("Description", "Describe the task and its context", cx)
        });
        let criteria = cx.new(|cx| {
            Input::multiline_field(
                "Acceptance criteria",
                "How will you know it is complete?",
                cx,
            )
        });
        let base = cx.new(|cx| {
            Input::field(
                "Base branch (optional)",
                "Project default",
                content(0.35),
                cx,
            )
        });
        description.update(cx, |input, _| {
            input.set_min_height(82.);
            input.set_max_height(82.);
        });
        criteria.update(cx, |input, _| {
            input.set_min_height(60.);
            input.set_max_height(60.);
        });

        Self {
            title,
            description,
            criteria,
            base,
        }
    }

    pub(in crate::task_board) fn all(&self) -> [&Entity<Input>; 4] {
        [&self.title, &self.description, &self.criteria, &self.base]
    }

    pub(in crate::task_board) fn set_read_only(&self, read_only: bool, cx: &mut App) {
        for field in self.all() {
            field.update(cx, |input, _| input.set_read_only(read_only));
        }
    }

    pub(in crate::task_board) fn is_composing(&self, window: &Window, cx: &App) -> bool {
        self.all().iter().any(|input| {
            let input = input.read(cx);
            input.focus_handle(cx).is_focused(window) && input.is_composing()
        })
    }
}
