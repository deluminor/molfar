use super::{
    schema::{integer, object, request_id, string},
    Tool,
};
use crate::{
    app_access::board::stage::StageTool,
    external_mcp::grants::types::{Requirement, GRANT},
};
use serde_json::json;

pub(super) fn definitions() -> impl Iterator<Item = Tool> {
    StageTool::ALL.into_iter().map(|tool| {
        let mut properties = json!({
            "cardId": string("Board card ID"),
            "expectedUpdatedAt": integer("updatedAt from board_read"),
            "requestId": request_id(),
        });
        let mut required = vec!["cardId", "expectedUpdatedAt", "requestId"];
        let description = match tool {
            StageTool::Start => "Start Grill on a Backlog card.",
            StageTool::Answer => {
                required.push("answers");
                properties["answers"] = json!({"type":"array","minItems":1,"items":object(
                    json!({"number":integer("Question number"),"answer":string("Blank uses recommendation")}),
                    &["number","answer"]
                )});
                properties["note"] = string("Optional note");
                "Answer the current Grill questions."
            }
            StageTool::RequestChanges => {
                required.push("note");
                properties["note"] = string("Changes to request");
                "Request changes and queue another Grill round."
            }
            StageTool::Rework => {
                required.extend(["findings", "reviewVersion"]);
                properties["findings"] = json!({"type":"array","items":{"type":"string"}});
                properties["reviewVersion"] = integer("Review artifact version");
                properties["note"] = string("Optional note");
                "Request rework for the selected review findings."
            }
            StageTool::Retry => "Retry the failed stage.",
            StageTool::Back => "Return from a failed stage to its previous gate.",
            StageTool::Cancel => "Cancel the queued or running stage.",
        };
        Tool {
            name: tool.name(),
            requires: Requirement::standard(&[GRANT::BoardRun]),
            mutation: true,
            description,
            schema: object(properties, &required),
        }
    })
}
