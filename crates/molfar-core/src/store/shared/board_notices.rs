use super::super::Store;

impl Store {
    pub(in crate::store) fn shared_claim_board_notice(&self, key: &str) -> Result<bool, String> {
        self.shared_writable()?;
        let shared = self
            .shared
            .as_ref()
            .ok_or("Desktop store is unavailable.")?;
        let fresh = if let Some(conn) = &shared.extras_db {
            conn.execute(
                "INSERT OR IGNORE INTO settings(key,value) VALUES(?1,'1')",
                [key],
            )
            .map_err(|e| e.to_string())?
                > 0
        } else {
            !shared.extras.borrow().contains_key(key)
        };
        shared.extras.borrow_mut().insert(key.into(), "1".into());
        Ok(fresh)
    }
}
