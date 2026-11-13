use super::lock;
use crate::{
    store::Store,
    task_board::{
        constants::REWORK,
        delivery::{
            ci::{self, constants::MAX_LOG_JOBS, types::CiState},
            port::DeliveryPort,
            record,
            types::DeliveryMethod,
        },
        stage::lifecycle::storage::query,
        types::Card,
    },
};
use std::{path::Path, sync::Mutex};

#[derive(Debug)]
pub enum CiProgress {
    Waiting,
    /// Back in delivering: finish the remaining steps of this delivery method.
    Passed(Card, DeliveryMethod),
    Reworked(Card),
    Stopped(Card),
}

/// One CI look for a card waiting at Final review; every state change keys on the
/// revision read here, so a card the user touched meanwhile is left alone.
pub fn check(
    store: &Mutex<Store>,
    port: &impl DeliveryPort,
    card: &Card,
) -> Result<CiProgress, String> {
    let delivery = record::parse(card.delivery_json.as_deref())
        .ok_or("The card waits for CI without a delivery record.")?;
    let url = delivery
        .pr_url
        .ok_or("The card waits for CI without a pull request.")?;
    let project = Path::new(&card.project_cwd);
    let checks = ci::parse(&port.ci_rollup(project, &url)?)?;
    let waited = query::now()?.saturating_sub(card.updated_at);

    match ci::evaluate(checks, waited) {
        CiState::Pending => Ok(CiProgress::Waiting),
        CiState::Passed => {
            let card = lock(store)?.board_ci_passed(&card.id, card.updated_at)?;
            Ok(CiProgress::Passed(card, delivery.method))
        }
        CiState::Failed(failed) => {
            let logs: Vec<(String, String)> = failed
                .iter()
                .filter_map(|check| Some((check, ci::job_id(check.link.as_deref()?)?)))
                .take(MAX_LOG_JOBS)
                .map(|(check, job)| {
                    let log = port
                        .ci_failed_log(project, job)
                        .unwrap_or_else(|error| format!("The log could not be read: {error}"));
                    (check.name.clone(), log)
                })
                .collect();
            let brief = ci::brief(&url, &failed, &logs);
            let card = lock(store)?.board_ci_failed(&card.id, card.updated_at, &brief)?;
            if card.column_id == REWORK {
                return Ok(CiProgress::Reworked(card));
            }
            Ok(CiProgress::Stopped(card))
        }
    }
}
