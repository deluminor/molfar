use super::Store;
use crate::task_board::{
    constants::TASK,
    stage::{
        contracts::{
            constants::{ANSWERS, PLAN, QUESTIONS, SPEC},
            types::HandoffInput,
        },
        lifecycle::artifacts,
        owner,
    },
    types::ArtifactMeta,
};
use rusqlite::{params, OptionalExtension};
use std::path::PathBuf;

impl Store {
    pub(super) fn board_artifact_base(&self) -> Result<PathBuf, String> {
        self.data_dir()
            .map(|p| p.join("task-board"))
            .ok_or_else(|| "Board artifacts require a file-backed database.".into())
    }

    pub fn board_owner_review(&self, id: &str) -> Result<owner::types::Review, String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let review = owner::load(&tx, &self.board_artifact_base()?, id)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(review)
    }

    pub fn board_final_review(&self, id: &str) -> Result<owner::types::FinalReview, String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let review = owner::load_final(&tx, &self.board_artifact_base()?, id)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(review)
    }

    pub fn board_stage_inputs(&self, card: &str) -> Result<Vec<HandoffInput>, String> {
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let current = crate::task_board::stage::lifecycle::storage::query::card(&tx, card)?;
        let stage = crate::task_board::stage::agent::AgentStage::parse(&current.column_id)
            .ok_or("Card is not in an agent stage.")?;
        if stage != crate::task_board::stage::agent::AgentStage::Grill {
            let contract =
                crate::task_board::stage::contracts::input_contract(stage, current.grill_round);
            let mut inputs = Vec::new();
            for kind in contract.required.iter().chain(contract.optional).copied() {
                let version = owner::latest(&tx, card, kind)?;
                if let Some(version) = version {
                    inputs.push(HandoffInput {
                        kind: kind.into(),
                        version,
                        body: self.board_stage_artifact(card, kind, version)?,
                    });
                } else if contract.required.contains(&kind) {
                    return Err(format!("Missing input artifact: {kind}."));
                }
            }
            tx.commit().map_err(|e| e.to_string())?;
            return Ok(inputs);
        }
        let mut inputs = vec![self.board_task_input(card)?];
        if current.grill_round > 1 {
            let mut loaded = Vec::new();
            let mut complete = true;
            for kind in [SPEC, PLAN, ANSWERS, QUESTIONS] {
                let version = if kind == QUESTIONS {
                    owner::question_version(&tx, card)?
                } else {
                    owner::latest(&tx, card, kind)?
                };
                match version {
                    Some(version) => loaded.push(HandoffInput {
                        kind: kind.into(),
                        version,
                        body: self.board_stage_artifact(card, kind, version)?,
                    }),
                    None if kind != QUESTIONS => complete = false,
                    None => {}
                }
            }
            if complete {
                inputs.extend(loaded);
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(inputs)
    }

    fn board_task_input(&self, card: &str) -> Result<HandoffInput, String> {
        let version:i64=self.conn.query_row("SELECT version FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 ORDER BY version DESC LIMIT 1",params![card,TASK],|r|r.get(0)).optional().map_err(|e|e.to_string())?.ok_or("Board card has no initial task artifact.")?;
        Ok(HandoffInput {
            kind: TASK.into(),
            version,
            body: self.board_stage_artifact(card, TASK, version)?,
        })
    }

    pub fn board_stage_artifact(
        &self,
        card: &str,
        kind: &str,
        version: i64,
    ) -> Result<String, String> {
        let exists:bool=self.conn.query_row("SELECT EXISTS(SELECT 1 FROM task_board_artifacts WHERE card_id=?1 AND kind=?2 AND version=?3)",params![card,kind,version],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !exists {
            return Err("Board artifact not found.".into());
        }
        artifacts::read(&self.board_artifact_base()?, card, kind, version)
    }

    pub fn board_stage_artifacts(&self, card: &str) -> Result<Vec<ArtifactMeta>, String> {
        self.conn
            .prepare(&format!(
                "{} WHERE card_id=?1 ORDER BY kind,version",
                crate::task_board::read::ARTIFACTS_SELECT
            ))
            .map_err(|e| e.to_string())?
            .query_map([card], crate::task_board::read::artifacts_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}
