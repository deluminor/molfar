use crate::{
    external_mcp::tools::parse,
    store::Store,
    task_board::stage::{
        lifecycle::types::{ActionEffect, StageAction},
        owner::types::Answer,
        transitions::{allowed::action_allowed, types::BoardAction},
    },
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Copy)]
pub enum StageTool {
    Start,
    Answer,
    RequestChanges,
    Rework,
    Retry,
    Back,
    Cancel,
}

impl StageTool {
    pub const ALL: [Self; 7] = [
        Self::Start,
        Self::Answer,
        Self::RequestChanges,
        Self::Rework,
        Self::Retry,
        Self::Back,
        Self::Cancel,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Start => "board_start",
            Self::Answer => "board_answer",
            Self::RequestChanges => "board_request_changes",
            Self::Rework => "board_rework",
            Self::Retry => "board_retry",
            Self::Back => "board_back",
            Self::Cancel => "board_cancel",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|tool| tool.name() == name)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Simple {
    card_id: String,
    expected_updated_at: i64,
    #[serde(rename = "requestId")]
    _request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Answers {
    card_id: String,
    expected_updated_at: i64,
    #[serde(rename = "requestId")]
    _request_id: String,
    answers: Vec<AnswerInput>,
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Changes {
    card_id: String,
    expected_updated_at: i64,
    #[serde(rename = "requestId")]
    _request_id: String,
    note: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Rework {
    card_id: String,
    expected_updated_at: i64,
    #[serde(rename = "requestId")]
    _request_id: String,
    findings: Vec<String>,
    note: Option<String>,
    review_version: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AnswerInput {
    number: i64,
    answer: String,
}

pub fn stage_action(tool: StageTool, input: &Value) -> Result<(String, i64, StageAction), String> {
    let result = match tool {
        StageTool::Answer => {
            let args: Answers = parse(input)?;
            if args.answers.is_empty() {
                return Err("Supply at least one answer.".into());
            }
            let answers = args
                .answers
                .into_iter()
                .map(|input| Answer {
                    number: input.number,
                    answer: input.answer,
                })
                .collect();
            (
                args.card_id,
                args.expected_updated_at,
                StageAction::Answer {
                    answers,
                    note: args.note.unwrap_or_default(),
                },
            )
        }
        StageTool::RequestChanges => {
            let args: Changes = parse(input)?;
            (
                args.card_id,
                args.expected_updated_at,
                StageAction::RequestChanges(args.note),
            )
        }
        StageTool::Rework => {
            let args: Rework = parse(input)?;
            (
                args.card_id,
                args.expected_updated_at,
                StageAction::Rework {
                    findings: args.findings,
                    note: args.note.unwrap_or_default(),
                    review_version: args.review_version,
                },
            )
        }
        StageTool::Start | StageTool::Retry | StageTool::Back | StageTool::Cancel => {
            let args: Simple = parse(input)?;
            let action = match tool {
                StageTool::Start => StageAction::Start,
                StageTool::Retry => StageAction::Retry(None),
                StageTool::Back => StageAction::Back,
                StageTool::Cancel => StageAction::Cancel,
                _ => unreachable!(),
            };
            (args.card_id, args.expected_updated_at, action)
        }
    };
    Ok(result)
}

pub fn apply(
    store: &mut Store,
    projects: &[String],
    id: &str,
    expected: i64,
    action: StageAction,
) -> Result<ActionEffect, String> {
    if !EXTERNAL_ACTIONS.contains(&action.board_action())
        || matches!(action, StageAction::Retry(Some(_)))
    {
        return Err("This Board action is unavailable through external MCP.".into());
    }
    let card = store.board_scoped_card(id, projects)?;
    if card.updated_at == expected {
        let snapshot = store.board_snapshot(Some(&card.project_cwd), card.archived, Some(id))?;
        action_allowed(&card, &snapshot, action.board_action())?;
    }
    store.board_stage_action(id, expected, action)
}

pub(super) const EXTERNAL_ACTIONS: [BoardAction; 7] = [
    BoardAction::Start,
    BoardAction::Answer,
    BoardAction::RequestChanges,
    BoardAction::Rework,
    BoardAction::Retry,
    BoardAction::Back,
    BoardAction::Cancel,
];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_stage_tool_maps_to_the_matching_desktop_action_and_grant() {
        use crate::external_mcp::{grants::types::GRANT, tools::validate};

        for (tool, action) in StageTool::ALL.into_iter().zip(EXTERNAL_ACTIONS) {
            let mut args = json!({"cardId":"card","expectedUpdatedAt":17,"requestId":"r"});
            match tool {
                StageTool::Answer => args["answers"] = json!([{"number":1,"answer":""}]),
                StageTool::RequestChanges => args["note"] = json!("Revise"),
                StageTool::Rework => {
                    args["findings"] = json!(["F1"]);
                    args["reviewVersion"] = json!(3);
                }
                _ => {}
            }
            let definition = validate(tool.name(), &args).unwrap();
            assert_eq!(definition.requires.any, [GRANT::BoardRun]);
            let (id, revision, mapped) = stage_action(tool, &args).unwrap();
            assert_eq!(
                (id.as_str(), revision, mapped.board_action()),
                ("card", 17, action)
            );
            args["unexpected"] = json!(true);
            assert!(validate(tool.name(), &args).is_err());
        }
    }

    #[test]
    fn retry_only_accepts_the_desktop_default_model() {
        let mut args = json!({"cardId":"c","expectedUpdatedAt":1,"requestId":"r"});
        assert_eq!(
            stage_action(StageTool::Retry, &args).unwrap().2,
            StageAction::Retry(None)
        );
        args["model"] = json!("override");
        assert!(stage_action(StageTool::Retry, &args).is_err());
    }
}
