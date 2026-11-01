use super::Store;
use crate::{agent::TurnInfo, app_access::turn::StoredAppTurn};

#[cfg(test)]
mod output_tests;
#[cfg(test)]
mod provenance_tests;
#[cfg(test)]
mod tests;

impl Store {
    /// Shared receipts update only their existing prompt; terminal provenance is immutable.
    pub fn save_turn_receipt(
        &self,
        session: i64,
        turn: usize,
        info: &TurnInfo,
    ) -> Result<(), String> {
        if self.shared.is_some() {
            return self.shared_save_turn_receipt(session, turn, info);
        }

        let transcript = self.load(session)?;
        let prompt = turn
            .checked_sub(1)
            .and_then(|index| transcript.rows.get(index));
        let continuation = transcript
            .rows
            .get(turn)
            .is_some_and(|row| row.is_prompt() && !row.first);
        if !prompt.is_some_and(crate::transcript::Row::is_prompt) || continuation {
            return Err("Turn receipt does not match an existing prompt.".into());
        }
        let mut settings = self.agent_settings(session)?.unwrap_or_default();
        let mut info = info.clone();
        if let Some(previous) = settings
            .turns
            .get(&turn)
            .and_then(|value| value.completion.as_ref())
        {
            if info
                .completion
                .as_ref()
                .is_some_and(|next| next != previous)
            {
                return Err("Turn completion is immutable.".into());
            }
            info.completion = Some(previous.clone());
        }
        settings.turns.insert(turn, info);
        self.save_agent_settings(session, &settings)
    }

    /// Reads whole persisted output by durable request identity, never a viewport or control limit.
    pub fn app_turn_result(
        &self,
        session: i64,
        request: &str,
    ) -> Result<Option<StoredAppTurn>, String> {
        if self.shared.is_none() {
            return Err("Exact app-turn results require desktop request provenance.".into());
        }
        self.shared_app_turn_result(session, &super::app_access::prompt_message_id(request))
    }
}
