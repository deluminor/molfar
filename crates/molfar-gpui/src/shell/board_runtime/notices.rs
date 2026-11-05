use super::*;
use crate::notifications::delivery::Target;
use molfar_core::task_board::stage::lifecycle::types::StageNotice;

impl Shell {
    pub(super) fn board_notice(&mut self, notice: StageNotice, cx: &mut Context<Self>) {
        let category = "agentInput";
        let summary = Session {
            id: 0,
            provider: String::new(),
            cwd: notice.project_cwd,
            title: notice.title,
            archived: false,
            has_messages: true,
            updated_at: molfar_core::time::now_ms(),
            provider_id: None,
            pinned: false,
            work_item: None,
        };
        self.dispatch_notice(
            &summary,
            category,
            Target::Board(notice.card_id),
            &notice.body,
            None,
            cx,
        );
    }
}
