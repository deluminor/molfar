use serde::{Deserialize, Deserializer, Serialize};

pub(crate) const COLUMNS: [&str; 8] = [
    "backlog",
    "grill",
    "plan_approval",
    "implement",
    "code_review",
    "final_review",
    "rework",
    "done",
];
pub(crate) const RUN_STATES: [&str; 4] = ["idle", "queued", "running", "failed"];
pub(crate) const STAGES: [&str; 4] = ["grill", "implement", "code_review", "rework"];
pub(crate) const RUN_STATUSES: [&str; 5] =
    ["running", "succeeded", "failed", "cancelled", "interrupted"];
pub(crate) const DISPATCHES: [&str; 4] =
    ["accepted", "session_prepared", "turn_submitted", "settled"];
pub(crate) const ARTIFACT_KINDS: [&str; 9] = [
    "task",
    "spec",
    "plan",
    "questions",
    "answers",
    "impl_report",
    "review",
    "rework_brief",
    "delivery",
];
pub(crate) const ARTIFACT_SOURCES: [&str; 3] = ["stage", "user", "engine"];
pub(crate) const RUNTIME_MODES: [&str; 4] =
    ["supervised", "auto-accept-edits", "auto", "full-access"];

/// Prefix the webview matches to tell a stale compare-and-swap from other failures.
pub(crate) const CONFLICT: &str = "conflict: the card changed; reload and try again";

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub number: i64,
    pub project_cwd: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: String,
    pub column_id: String,
    pub run_state: String,
    pub position: f64,
    pub base_ref: Option<String>,
    pub base_sha: Option<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub grill_round: i64,
    pub rework_cycle: i64,
    pub overrides_json: String,
    pub last_error: Option<String>,
    pub delivery_json: Option<String>,
    pub archived: bool,
    pub queued_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCreate {
    pub id: String,
    pub project_cwd: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub acceptance_criteria: String,
    #[serde(default)]
    pub base_ref: Option<String>,
}

/// Every field is optional; `Some(None)` clears a nullable column.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub column_id: Option<String>,
    pub run_state: Option<String>,
    pub position: Option<f64>,
    #[serde(default, deserialize_with = "nullable")]
    pub base_ref: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable")]
    pub base_sha: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable")]
    pub branch: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable")]
    pub worktree_path: Option<Option<String>>,
    pub grill_round: Option<i64>,
    pub rework_cycle: Option<i64>,
    pub overrides_json: Option<String>,
    #[serde(default, deserialize_with = "nullable")]
    pub last_error: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable")]
    pub delivery_json: Option<Option<String>>,
    pub archived: Option<bool>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StageRun {
    pub id: String,
    pub card_id: String,
    pub stage: String,
    pub attempt: i64,
    pub session_id: Option<String>,
    pub harness: String,
    pub model: String,
    pub settings_json: String,
    pub runtime_mode: String,
    pub template_version: i64,
    pub dispatch: String,
    pub status: String,
    pub error: Option<String>,
    pub head_before: Option<String>,
    pub porcelain_before: Option<String>,
    pub fingerprint_before: Option<String>,
    pub head_after: Option<String>,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRunCreate {
    pub id: String,
    pub card_id: String,
    pub stage: String,
    pub harness: String,
    pub model: String,
    #[serde(default = "empty_object")]
    pub settings_json: String,
    pub runtime_mode: String,
    pub template_version: i64,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRunPatch {
    pub session_id: Option<String>,
    pub dispatch: Option<String>,
    pub status: Option<String>,
    pub error: Option<String>,
    pub head_before: Option<String>,
    pub porcelain_before: Option<String>,
    pub fingerprint_before: Option<String>,
    pub head_after: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactMeta {
    pub id: String,
    pub card_id: String,
    pub kind: String,
    pub version: i64,
    pub source: String,
    pub stage_run_id: Option<String>,
    pub created_at: i64,
}

fn empty_object() -> String {
    "{}".into()
}

/// Distinguishes a missing field (keep) from an explicit `null` (clear).
fn nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
