use super::Store;
use crate::task_board::types::Snapshot;

impl Store {
    pub fn board_snapshot(
        &self,
        project: Option<&str>,
        archived: bool,
        selected: Option<&str>,
    ) -> Result<Snapshot, String> {
        crate::task_board::read::snapshot(&self.conn, project, archived, selected)
    }
}
