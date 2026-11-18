use super::{prompt_message_id, Store};

/// Where an app prompt reserved under one request ID stands, so a retry after
/// an interruption resumes that prompt instead of submitting a second turn.
#[derive(Debug, PartialEq)]
pub enum PROMPT {
    /// Nothing was reserved: the caller may prepare and send it.
    Missing,
    /// Reserved as the session's draft but never handed to its queue.
    Draft,
    /// In the session's follow-up queue, awaiting delivery.
    Queued,
    /// Accepted by the provider.
    Delivered,
}

impl Store {
    /// A launch is recoverable as an unsent draft if the app exits before its
    /// provider accepts it. Queue delivery uses this same stable message ID.
    pub fn prepare_app_prompt(&self, id: i64, request: &str, prompt: &str) -> Result<(), String> {
        let mut state = self.follow_ups(id)?;
        let message_id = prompt_message_id(request);
        if state.draft.is_none() && !state.messages.iter().any(|m| m.id == message_id) {
            state.revision += 1;
            state.draft = Some(crate::follow_up::Message {
                id: message_id,
                text: prompt.into(),
                ..Default::default()
            });
            self.save_follow_ups(id, &state)?;
        }
        Ok(())
    }

    pub fn app_prompt_state(&self, id: i64, request: &str) -> Result<PROMPT, String> {
        let message = prompt_message_id(request);
        if self
            .setting(&format!("familiar-delivered:{id}:{message}"))?
            .is_some()
        {
            return Ok(PROMPT::Delivered);
        }

        let state = self.follow_ups(id)?;
        if state.draft.is_some_and(|draft| draft.id == message) {
            return Ok(PROMPT::Draft);
        }
        if state.messages.iter().any(|queued| queued.id == message) {
            return Ok(PROMPT::Queued);
        }
        Ok(PROMPT::Missing)
    }
}

#[cfg(test)]
mod tests {
    use super::PROMPT;
    use crate::store::Store;
    use std::path::Path;

    #[test]
    fn a_reserved_prompt_moves_from_draft_through_queue_to_delivered() {
        let mut store = Store::open_desktop(Path::new(":memory:")).unwrap();
        let id = store.create("codex", "/work/repo").unwrap().id;
        let state = |store: &Store, request: &str| store.app_prompt_state(id, request).unwrap();

        assert_eq!(state(&store, "r"), PROMPT::Missing);
        store.prepare_app_prompt(id, "r", "Continue").unwrap();
        assert_eq!(state(&store, "r"), PROMPT::Draft);
        assert_eq!(state(&store, "other"), PROMPT::Missing);

        let mut queue = store.follow_ups(id).unwrap();
        let message = queue.draft.take().unwrap();
        queue.messages.push(message.clone());
        store.save_follow_ups(id, &queue).unwrap();
        assert_eq!(state(&store, "r"), PROMPT::Queued);

        let mut transcript = crate::transcript::Transcript::default();
        transcript.begin("user");
        transcript.append("Continue");
        store
            .write_rows_with_message(id, 0, &transcript.rows, Some(&message.id))
            .unwrap();
        assert_eq!(state(&store, "r"), PROMPT::Delivered);
    }
}
