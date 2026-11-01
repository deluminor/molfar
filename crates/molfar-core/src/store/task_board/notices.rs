use super::Store;
use crate::task_board::constants::{FINAL_REVIEW, IDLE, PLAN_APPROVAL};
use crate::task_board::stage::lifecycle::{
    constants::{DEFAULT_STALL_MINUTES, FAILED, MAX_STALL_MINUTES, RUNNING},
    storage::{query, settlement},
    types::{NoticeKind, StageNotice},
};
use rusqlite::params;

impl Store {
    pub fn board_attention(&self) -> Result<usize, String> {
        self.conn.query_row("SELECT COUNT(*) FROM task_board_cards WHERE archived=0 AND (run_state=?1 OR (run_state=?3 AND column_id IN (?2,?4)))",params![FAILED,PLAN_APPROVAL,IDLE,FINAL_REVIEW],|r|r.get::<_,i64>(0)).map_err(|e|e.to_string()).and_then(|count|usize::try_from(count).map_err(|e|e.to_string()))
    }

    pub fn board_take_stall_notices(&self, now: u64) -> Result<Vec<StageNotice>, String> {
        self.board_writable()?;
        let settings = query::settings(&self.conn)?;
        let minutes = settings
            .get("stallMinutes")
            .map(|value| value.as_u64().ok_or("Invalid Board stall setting."))
            .transpose()?
            .unwrap_or(DEFAULT_STALL_MINUTES);
        if !(1..=MAX_STALL_MINUTES).contains(&minutes) {
            return Err("Stall time must be between 1 and 1440 minutes.".into());
        }
        let mut notices = Vec::new();
        for ctx in self.board_running_grills()? {
            if !query::current(&self.conn, &ctx)?
                || ctx.run.status != RUNNING
                || now.saturating_sub(ctx.run.started_at.max(0) as u64) < minutes * 60_000
            {
                continue;
            }
            let key = format!("board-stall-notice:{}", ctx.run.id);
            if self.board_claim_notice(&key)? {
                notices.push(settlement::notice(
                    &ctx.card,
                    NoticeKind::Stalled,
                    format!("Grill has been running for at least {minutes} minutes."),
                ));
            }
        }
        Ok(notices)
    }

    fn board_claim_notice(&self, key: &str) -> Result<bool, String> {
        if self.shared.is_some() {
            return self.shared_claim_board_notice(key);
        }
        self.conn
            .execute(
                "INSERT OR IGNORE INTO native_settings(key,value) VALUES(?1,'1')",
                [key],
            )
            .map(|count| count > 0)
            .map_err(|e| e.to_string())
    }
}
