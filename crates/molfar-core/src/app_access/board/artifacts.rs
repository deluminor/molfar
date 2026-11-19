use crate::{external_mcp::tools::parse, store::Store, task_board::types::ArtifactRead};
use serde::Deserialize;
use serde_json::{json, Value};

pub const LIST: &str = "board_artifacts_list";
pub const READ: &str = "board_artifacts_read";
const DEFAULT_TEXT_PAGE: usize = 6_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct List {
    card_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Read {
    pub card_id: String,
    pub kind: String,
    pub version: Option<i64>,
    pub max_chars: Option<usize>,
    #[serde(default)]
    pub char_offset: usize,
}

impl Read {
    pub(super) fn page(
        &self,
        store: &Store,
        projects: &[String],
        artifacts: &[crate::task_board::types::ArtifactMeta],
    ) -> Result<Value, String> {
        let version = artifacts
            .iter()
            .filter(|meta| {
                meta.kind == self.kind && self.version.is_none_or(|version| version == meta.version)
            })
            .map(|meta| meta.version)
            .max()
            .ok_or("Board artifact not found.")?;
        let page = store.board_scoped_artifact(
            &self.card_id,
            projects,
            &ArtifactRead {
                kind: &self.kind,
                version,
                max_chars: self.max_chars.unwrap_or(DEFAULT_TEXT_PAGE),
                char_offset: self.char_offset,
            },
        )?;
        Ok(
            json!({"kind":self.kind,"version":version,"body":page.body,"nextCharOffset":page.next_char_offset}),
        )
    }
}

pub fn validate(tool: &str, input: &Value) -> Result<(), String> {
    match tool {
        LIST => parse::<List>(input).map(drop),
        READ => parse::<Read>(input).map(drop),
        _ => Err("Unknown Board artifact tool.".into()),
    }
}

pub fn action(
    store: &Store,
    tool: &str,
    input: &Value,
    projects: &[String],
) -> Result<Value, String> {
    match tool {
        LIST => {
            let request: List = parse(input)?;
            store.board_scoped_card(&request.card_id, projects)?;
            let artifacts = store.board_stage_artifacts(&request.card_id)?;
            Ok(json!({"artifacts":artifacts.iter().map(|meta| json!({
                "kind":meta.kind,"version":meta.version,"source":meta.source,
                "stageRunId":meta.stage_run_id,"createdAt":meta.created_at,
            })).collect::<Vec<_>>()}))
        }
        READ => {
            let request: Read = parse(input)?;
            store.board_scoped_card(&request.card_id, projects)?;
            let artifacts = store.board_stage_artifacts(&request.card_id)?;
            request.page(store, projects, &artifacts)
        }
        _ => Err("Unknown Board artifact tool.".into()),
    }
}
