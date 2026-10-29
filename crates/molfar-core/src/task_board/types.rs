use serde::Serialize;

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

#[derive(Clone, Debug, Default)]
pub struct Snapshot {
    pub cards: Vec<Card>,
    pub selected: Option<String>,
    pub runs: Vec<StageRun>,
    pub artifacts: Vec<ArtifactMeta>,
    pub settings_json: Option<String>,
}
