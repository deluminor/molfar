use super::{check, parse, schema::*, TargetKind, Tool};
use crate::automations::AutomationTrigger;
use crate::external_mcp::grants::types::{ACCESS, DOMAIN};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct List {
    pub project: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Read {
    pub automation_id: String,
    pub max_chars: Option<usize>,
    pub char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Runs {
    pub automation_id: String,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetEnabled {
    pub automation_id: String,
    pub enabled: bool,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mutation {
    pub automation_id: String,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Upsert {
    pub automation_id: Option<String>,
    pub project: Option<String>,
    pub name: String,
    pub prompt: String,
    pub triggers: Option<Vec<Trigger>>,
    pub workspace_mode: Option<String>,
    pub reuse_session: Option<bool>,
    pub missed_run_grace_minutes: Option<i64>,
    pub enabled: Option<bool>,
    pub request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Trigger {
    id: Option<String>,
    kind: String,
    event: Option<String>,
    schedule_kind: Option<String>,
    minute: Option<i64>,
    time: Option<String>,
    day_of_week: Option<i64>,
    repos: Option<Vec<String>>,
    repo: Option<String>,
    branch: Option<String>,
    actor: Option<String>,
}

impl Trigger {
    pub fn into_trigger(self, fallback_id: String) -> AutomationTrigger {
        let Self {
            id,
            kind,
            event,
            schedule_kind,
            minute,
            time,
            day_of_week,
            repos,
            repo,
            branch,
            actor,
        } = self;
        let defaults = AutomationTrigger::new(&kind, event.as_deref().unwrap_or_default());
        AutomationTrigger {
            id: id.filter(|id| !id.is_empty()).unwrap_or(fallback_id),
            kind,
            event: event.unwrap_or_default(),
            schedule_kind: schedule_kind.unwrap_or(defaults.schedule_kind),
            minute: minute.unwrap_or(defaults.minute),
            time: time.unwrap_or(defaults.time),
            day_of_week: day_of_week.unwrap_or(defaults.day_of_week),
            repos: repos.unwrap_or_default(),
            repo: repo.unwrap_or_default(),
            branch: branch.unwrap_or_default(),
            actor: actor.unwrap_or(defaults.actor),
        }
    }
}

pub(super) fn definitions() -> Vec<Tool> {
    let id = || string("Automation ID");
    let limit = || integer("1–100, default 30");
    let offset = || integer("nextOffset from a previous page");
    let mutation = || {
        object(
            json!({"automationId":id(),"requestId":request_id()}),
            &["automationId", "requestId"],
        )
    };
    let trigger = object(
        json!({
            "id":string("Optional trigger ID"),"kind":string("Time or inbox provider"),
            "event":string("Trigger event"),"scheduleKind":string("Time schedule kind"),
            "minute":integer("Minute of hour"),"time":string("Local HH:MM"),
            "dayOfWeek":integer("Day of week"),"repos":{"type":"array","items":{"type":"string"}},
            "repo":string("Repository"),"branch":string("Branch"),"actor":string("Actor filter")
        }),
        &["kind"],
    );
    [
        ("automations_list", "List automations in granted projects.", false, ACCESS::Standard,
            object(json!({"project":string("Optional granted project"),"limit":limit(),"offset":offset()}), &[])),
        ("automations_read", "Read an automation and a page of its prompt.", false, ACCESS::Standard,
            object(json!({"automationId":id(),"maxChars":integer("1–6000"),"charOffset":integer("nextCharOffset from a previous page")}), &["automationId"])),
        ("automations_runs", "List run metadata for an automation.", false, ACCESS::Standard,
            object(json!({"automationId":id(),"limit":limit(),"offset":offset()}), &["automationId"])),
        ("automations_set_enabled", "Enable or disable an existing automation.", true, ACCESS::Standard,
            object(json!({"automationId":id(),"enabled":{"type":"boolean"},"requestId":request_id()}), &["automationId","enabled","requestId"])),
        ("automations_upsert", "Create or edit an automation without changing permissions or projects.", true, ACCESS::Delegated,
            object(json!({
                "automationId":id(),"project":string("Granted project, required on create"),
                "name":string("Automation name"),"prompt":string("Prompt to run"),
                "triggers":{"type":"array","items":trigger},"workspaceMode":string("Workspace mode"),
                "reuseSession":{"type":"boolean"},"missedRunGraceMinutes":integer("Missed-run grace period"),
                "enabled":{"type":"boolean"},"requestId":request_id()
            }), &["name","prompt","requestId"])),
        ("automations_run_now", "Queue a run using the automation's existing configuration.", true, ACCESS::Delegated, mutation()),
        ("automations_delete", "Delete an automation.", true, ACCESS::Destructive, mutation()),
    ]
    .into_iter()
    .map(|(name, description, mutation, access, schema)| {
        let mut tool = Tool::domain(name, description, DOMAIN::Automations, TargetKind::Project, mutation, access, schema);
        tool.resumable = name != "automations_run_now";
        tool
    })
    .collect()
}

pub(super) fn validate(name: &str, arguments: &Value) -> Result<(), String> {
    match name {
        "automations_list" => check::<List>(arguments),
        "automations_read" => check::<Read>(arguments),
        "automations_runs" => check::<Runs>(arguments),
        "automations_set_enabled" => check::<SetEnabled>(arguments),
        "automations_run_now" | "automations_delete" => check::<Mutation>(arguments),
        "automations_upsert" => {
            let input: Upsert = parse(arguments)?;
            match (input.automation_id.is_some(), arguments.get("project")) {
                (true, None) => Ok(()),
                (false, Some(Value::String(_))) => Ok(()),
                (true, Some(_)) => {
                    Err("Project cannot be changed on an existing automation.".into())
                }
                (false, _) => Err("A granted project is required on create.".into()),
            }
        }
        _ => Err("Unknown automations tool.".into()),
    }
}
