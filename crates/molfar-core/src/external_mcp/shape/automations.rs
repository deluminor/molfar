use super::page;
use crate::automations::{Automation, AutomationRun};
use serde_json::{json, Value};

pub fn summary(automation: &Automation) -> Value {
    json!({
        "automationId":automation.id, "name":automation.name, "enabled":automation.enabled,
        "project":automation.cwd, "nextRunAt":automation.next_run_at,
        "lastRunAt":automation.last_run_at, "lastRunStatus":automation.last_run_status,
        "updatedAt":automation.updated_at,
    })
}

pub fn detail(
    automation: &Automation,
    max_chars: Option<usize>,
    offset: Option<usize>,
) -> Result<Value, String> {
    let (prompt, next) = page::text(&automation.prompt, max_chars, offset)?;
    let mut result = summary(automation);
    result["prompt"] = json!(prompt);
    result["nextCharOffset"] = json!(next);
    result["triggers"] = json!(automation.triggers());
    result["workspaceMode"] = json!(automation.workspace_mode);
    result["reuseSession"] = json!(automation.reuse_session);
    result["missedRunGraceMinutes"] = json!(automation.missed_run_grace_minutes);
    Ok(result)
}

pub fn run(run: &AutomationRun) -> Value {
    json!({
        "runId":run.id, "automationId":run.automation_id, "status":run.status,
        "scheduledFor":run.scheduled_for, "createdAt":run.created_at,
        "startedAt":run.started_at, "completedAt":run.completed_at,
    })
}
