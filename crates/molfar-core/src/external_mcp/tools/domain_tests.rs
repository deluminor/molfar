use super::*;
use serde_json::json;

#[test]
fn all_new_tools_validate_strict_input_and_enforce_their_capabilities() {
    use TargetKind::{Familiar, InboxProvider, Project, Vault};
    use ACCESS::{Delegated, Destructive, Standard};
    use DOMAIN::{Automations, Familiars, Inbox, Knowledge};

    let definitions = [
        (
            "knowledge_search",
            GRANT::Read(Knowledge),
            Standard,
            Vault,
            json!({"query":""}),
        ),
        (
            "knowledge_read",
            GRANT::Read(Knowledge),
            Standard,
            Vault,
            json!({"path":"a.md"}),
        ),
        (
            "knowledge_backlinks",
            GRANT::Read(Knowledge),
            Standard,
            Vault,
            json!({"path":"a.md"}),
        ),
        (
            "knowledge_neighbors",
            GRANT::Read(Knowledge),
            Standard,
            Vault,
            json!({"path":"a.md"}),
        ),
        (
            "knowledge_write",
            GRANT::Write(Knowledge),
            Standard,
            Vault,
            json!({"path":"a.md","body":"","expected":"revision"}),
        ),
        (
            "knowledge_toggle_task",
            GRANT::Write(Knowledge),
            Standard,
            Vault,
            json!({"path":"a.md","ordinal":0,"expected":"revision"}),
        ),
        (
            "automations_list",
            GRANT::Read(Automations),
            Standard,
            Project,
            json!({}),
        ),
        (
            "automations_read",
            GRANT::Read(Automations),
            Standard,
            Project,
            json!({"automationId":"a"}),
        ),
        (
            "automations_runs",
            GRANT::Read(Automations),
            Standard,
            Project,
            json!({"automationId":"a"}),
        ),
        (
            "automations_set_enabled",
            GRANT::Write(Automations),
            Standard,
            Project,
            json!({"automationId":"a","enabled":true}),
        ),
        (
            "automations_upsert",
            GRANT::Write(Automations),
            Delegated,
            Project,
            json!({"project":"/p","name":"Check","prompt":"Summarize"}),
        ),
        (
            "automations_run_now",
            GRANT::Write(Automations),
            Delegated,
            Project,
            json!({"automationId":"a"}),
        ),
        (
            "automations_delete",
            GRANT::Write(Automations),
            Destructive,
            Project,
            json!({"automationId":"a"}),
        ),
        (
            "familiars_list",
            GRANT::Read(Familiars),
            Standard,
            Familiar,
            json!({}),
        ),
        (
            "familiars_read",
            GRANT::Read(Familiars),
            Standard,
            Familiar,
            json!({"familiarId":"f","include":["memory","transcript"]}),
        ),
        (
            "familiars_create",
            GRANT::Write(Familiars),
            Standard,
            TargetKind::None,
            json!({}),
        ),
        (
            "familiars_update",
            GRANT::Write(Familiars),
            Standard,
            Familiar,
            json!({"familiarId":"f","name":"Familiar"}),
        ),
        (
            "familiars_send",
            GRANT::Write(Familiars),
            Delegated,
            Familiar,
            json!({"familiarId":"f","text":"Hello"}),
        ),
        (
            "familiars_reset",
            GRANT::Write(Familiars),
            Destructive,
            Familiar,
            json!({"familiarId":"f"}),
        ),
        (
            "familiars_delete",
            GRANT::Write(Familiars),
            Destructive,
            Familiar,
            json!({"familiarId":"f"}),
        ),
        (
            "inbox_list",
            GRANT::Read(Inbox),
            Standard,
            InboxProvider,
            json!({}),
        ),
        (
            "inbox_details",
            GRANT::Read(Inbox),
            Standard,
            InboxProvider,
            json!({"itemKey":"jira:issue"}),
        ),
        (
            "inbox_thread",
            GRANT::Read(Inbox),
            Standard,
            InboxProvider,
            json!({"itemKey":"jira:issue"}),
        ),
        (
            "inbox_diff",
            GRANT::Read(Inbox),
            Standard,
            InboxProvider,
            json!({"itemKey":"github:pr"}),
        ),
        (
            "inbox_comment",
            GRANT::Write(Inbox),
            Delegated,
            InboxProvider,
            json!({"itemKey":"jira:issue","body":"Hello"}),
        ),
    ];

    for (name, grant, access, target, mut input) in definitions {
        let mutation = matches!(grant, GRANT::Write(_));
        if mutation {
            assert!(validate(name, &input).is_err(), "{name} needs requestId");
            input["requestId"] = json!("valid");
        }
        let tool = validate(name, &input).unwrap_or_else(|error| panic!("{name}: {error}"));
        assert_eq!(tool.mutation, mutation, "{name}");
        assert_eq!(tool.requires.any, [grant], "{name}");
        assert_eq!(tool.requires.access, access, "{name}");
        assert_eq!(tool.target, target, "{name}");
        assert_eq!(
            tool.resumable,
            !matches!(
                name,
                "automations_run_now" | "familiars_send" | "inbox_comment"
            ),
            "{name}"
        );
        assert_eq!(tool.schema["additionalProperties"], false, "{name}");

        let mut principal = Principal {
            client_id: "client".into(),
            name: "Client".into(),
            grants: vec![],
            resources: vec![],
            projects: vec![],
        };
        assert!(!principal.allows(&tool.requires), "{name} defaults off");
        principal.grants.push(grant);
        match access {
            Standard => {}
            Delegated => {
                assert!(!principal.allows(&tool.requires), "{name} needs delegated");
                principal.grants.push(GRANT::Delegated);
            }
            Destructive => {
                assert!(
                    !principal.allows(&tool.requires),
                    "{name} needs destructive"
                );
                principal.grants.push(GRANT::Destructive);
            }
        }
        assert!(principal.allows(&tool.requires), "{name}");
        input["appAccess"] = json!("forbidden");
        assert!(
            validate(name, &input).is_err(),
            "{name} rejects unknown fields"
        );
    }
}
