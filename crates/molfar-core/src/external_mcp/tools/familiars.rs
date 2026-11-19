use super::{check, parse, schema::*, TargetKind, Tool};
use crate::external_mcp::grants::types::{ACCESS, DOMAIN};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct List {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Include {
    Memory,
    Transcript,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Read {
    pub familiar_id: String,
    #[serde(default)]
    pub include: Vec<Include>,
    pub before: Option<Value>,
    pub limit: Option<usize>,
    pub max_chars: Option<usize>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Create {
    pub name: Option<String>,
    pub mascot: Option<String>,
    pub color: Option<String>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Update {
    pub familiar_id: String,
    pub name: Option<String>,
    pub mascot: Option<String>,
    pub color: Option<String>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Send {
    pub familiar_id: String,
    pub text: String,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    pub familiar_id: String,
    pub request_id: String,
}

pub(super) fn definitions() -> Vec<Tool> {
    let id = || string("Familiar ID");
    let mutation = || {
        object(
            json!({"familiarId":id(),"requestId":request_id()}),
            &["familiarId", "requestId"],
        )
    };
    [
        ("familiars_list", "List allowed Familiars.", false, ACCESS::Standard,
            object(json!({"limit":integer("1–100, default 30"),"offset":integer("nextOffset from a previous page")}), &[])),
        ("familiars_read", "Read a Familiar's profile and optionally its memory or conversation.", false, ACCESS::Standard,
            object(json!({"familiarId":id(),"include":{"type":"array","items":{"enum":["memory","transcript"]}},
                "before":{"type":["string","integer"]},"limit":integer("1–3 exchanges"),"maxChars":integer("200–6000 per message"),
                "charOffset":integer("nextCharOffset from a previous page")}), &["familiarId"])),
        ("familiars_create", "Create a Familiar with no projects.", true, ACCESS::Standard,
            object(json!({"name":string("Display name"),"mascot":string("Mascot"),"color":string("#rrggbb"),"requestId":request_id()}), &["requestId"])),
        ("familiars_update", "Change a Familiar's name, mascot or colour.", true, ACCESS::Standard,
            object(json!({"familiarId":id(),"name":string("Display name"),"mascot":string("Mascot"),"color":string("#rrggbb"),"requestId":request_id()}), &["familiarId","requestId"])),
        ("familiars_send", "Queue a message in a Familiar's conversation.", true, ACCESS::Delegated,
            object(json!({"familiarId":id(),"text":string("Message text"),"requestId":request_id()}), &["familiarId","text","requestId"])),
        ("familiars_reset", "Reset a Familiar's conversation.", true, ACCESS::Destructive, mutation()),
        ("familiars_delete", "Remove a Familiar from the roster.", true, ACCESS::Destructive, mutation()),
    ]
    .into_iter()
    .map(|(name, description, mutation, access, schema)| {
        let target = if name == "familiars_create" { TargetKind::None } else { TargetKind::Familiar };
        let mut tool = Tool::domain(name, description, DOMAIN::Familiars, target, mutation, access, schema);
        tool.resumable = name != "familiars_send";
        tool
    })
    .collect()
}

pub(super) fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    match name {
        "familiars_list" => check::<List>(arguments),
        "familiars_read" => {
            let input: Read = parse(arguments)?;
            if input
                .before
                .is_some_and(|before| !before.is_string() && !before.is_u64())
            {
                return Err("before must be a turn ID.".into());
            }
            Ok(())
        }
        "familiars_create" => check::<Create>(arguments),
        "familiars_update" => check::<Update>(arguments),
        "familiars_send" => {
            let input: Send = parse(arguments)?;
            if input.text.trim().is_empty() || input.text.len() > 1_000_000 {
                return Err("A nonempty message of at most 1,000,000 bytes is required.".into());
            }
            Ok(())
        }
        "familiars_reset" | "familiars_delete" => check::<Mutation>(arguments),
        _ => Err("Unknown Familiars tool.".into()),
    }
}
