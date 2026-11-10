use super::Shell;
use crate::companion::Job;
use gpui::Context;
use serde_json::{Value, json};

impl Shell {
    pub(super) fn companion_vault_job(&mut self, job: Job, cx: &mut Context<Self>) {
        if let Err(error) = validate(&job.action, &job.input) {
            let _ = job.reply.send(json!({"ok": false, "error": error}));
            return;
        }
        let vault = self.ensure_vault(cx);
        let action = job.action.clone();
        let input = job.input.clone();
        let reply = job.reply.clone();
        let task = vault.update(cx, |service, cx| match action.as_str() {
            "vault.index" => service.companion_index(cx),
            "vault.read" => service.companion_read(string(&input, "path"), cx),
            "vault.write" => service.companion_write(
                string(&input, "path"),
                string(&input, "body"),
                string(&input, "ifRevision"),
                cx,
            ),
            _ => gpui::Task::ready(Err("Unknown Companion action".into())),
        });
        cx.spawn(async move |_, _| {
            let response = match task.await {
                Ok(result) => json!({"ok": true, "result": result}),
                Err(error) => json!({"ok": false, "error": error}),
            };
            let _ = reply.send(response);
        })
        .detach();
    }
}

fn string(input: &Value, key: &str) -> String {
    input[key].as_str().unwrap_or("").to_string()
}

fn validate(action: &str, input: &Value) -> Result<(), String> {
    match action {
        "vault.index" => Ok(()),
        "vault.read" => {
            path_of(input)?;
            Ok(())
        }
        "vault.write" => {
            path_of(input)?;
            let Some(body) = input["body"].as_str() else {
                return Err("body is required".into());
            };
            if body.len() > 2 * 1024 * 1024 {
                return Err("Note exceeds the 2 MiB limit".into());
            }
            match input["ifRevision"].as_str() {
                Some(revision) if !revision.is_empty() => Ok(()),
                _ => Err("ifRevision is required".into()),
            }
        }
        _ => Err("Unknown Companion action".into()),
    }
}

fn path_of(input: &Value) -> Result<(), String> {
    match input["path"].as_str() {
        Some(path) if !path.is_empty() && path.chars().count() <= 4096 => Ok(()),
        _ => Err("path is required".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::companion::Permit;
    use gpui::AppContext;
    use serde_json::json;
    use std::{path::PathBuf, sync::mpsc};

    struct Files {
        data: PathBuf,
        root: PathBuf,
    }

    impl Drop for Files {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.data);
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn connected(body: &str) -> Files {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let root = temp.join(format!("molfar-companion-vault-{}", uuid::Uuid::new_v4()));
        let data = temp.join(format!("molfar-companion-data-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(root.join("beta.md"), body).unwrap();
        let saved = json!({
            "id": "saved",
            "root": root.to_string_lossy(),
            "name": "Vault",
        });
        std::fs::write(data.join("knowledge-vault.json"), saved.to_string()).unwrap();
        Files { data, root }
    }

    fn install(cx: &mut gpui::TestAppContext, data: PathBuf) -> gpui::WindowHandle<Shell> {
        let (window, _, _) = crate::shell::tests::window(cx);
        window
            .update(cx, |shell, _, cx| {
                shell.vault = Some(cx.new(|cx| crate::knowledge::VaultService::new(data, cx)));
            })
            .unwrap();
        cx.run_until_parked();
        window
    }

    fn call(
        window: gpui::WindowHandle<Shell>,
        cx: &mut gpui::TestAppContext,
        action: &str,
        input: Value,
    ) -> Value {
        let receiver = window
            .update(cx, |shell, _, cx| {
                let (_host, permit) = Permit::fixture();
                let (sender, receiver) = mpsc::channel();
                shell.dispatch_companion_job(
                    Job {
                        permit,
                        action: action.into(),
                        input,
                        reply: sender,
                    },
                    cx,
                );
                receiver
            })
            .unwrap();
        cx.run_until_parked();
        receiver.try_recv().expect("companion reply")
    }

    #[gpui::test]
    fn vault_index_reports_whether_a_vault_is_connected(cx: &mut gpui::TestAppContext) {
        let data = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("molfar-companion-empty-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&data).unwrap();
        let window = install(cx, data.clone());
        let response = call(window, cx, "vault.index", json!({}));
        assert_eq!(response["result"]["connected"], false);
        let _ = std::fs::remove_dir_all(data);

        let files = connected("Beta body\n");
        let window = install(cx, files.data.clone());
        let response = call(window, cx, "vault.index", json!({}));
        assert_eq!(response["ok"], true);
        assert_eq!(response["result"]["connected"], true);
        assert_eq!(response["result"]["notes"][0]["path"], "beta.md");
    }

    #[gpui::test]
    fn vault_read_returns_the_note_and_write_rejects_a_stale_revision(
        cx: &mut gpui::TestAppContext,
    ) {
        let files = connected("Beta body\n");
        let window = install(cx, files.data.clone());
        let read = call(window, cx, "vault.read", json!({"path": "beta.md"}));
        assert_eq!(read["ok"], true);
        assert_eq!(read["result"]["body"], "Beta body\n");
        let revision = read["result"]["revision"].as_str().unwrap().to_string();
        std::fs::write(files.root.join("beta.md"), "External edit\n").unwrap();
        let stale = call(
            window,
            cx,
            "vault.write",
            json!({"path": "beta.md", "body": "Phone edit\n", "ifRevision": revision}),
        );
        assert_eq!(stale["ok"], false);
        assert!(stale["error"].as_str().unwrap().starts_with("CONFLICT:"));
        assert_eq!(
            std::fs::read_to_string(files.root.join("beta.md")).unwrap(),
            "External edit\n"
        );
        let current = molfar_core::knowledge::revision_of(b"External edit\n");
        let written = call(
            window,
            cx,
            "vault.write",
            json!({"path": "beta.md", "body": "Phone edit\n", "ifRevision": current}),
        );
        assert_eq!(written["ok"], true, "{written}");
        assert_eq!(
            std::fs::read_to_string(files.root.join("beta.md")).unwrap(),
            "Phone edit\n"
        );
        assert_eq!(written["result"]["body"], "Phone edit\n");
    }

    #[gpui::test]
    fn vault_jobs_reject_bad_input(cx: &mut gpui::TestAppContext) {
        let files = connected("Beta body\n");
        let window = install(cx, files.data.clone());
        let empty = call(window, cx, "vault.read", json!({"path": ""}));
        assert_eq!(empty["error"], "path is required");
        let missing = call(
            window,
            cx,
            "vault.write",
            json!({"path": "beta.md", "body": "x"}),
        );
        assert_eq!(missing["error"], "ifRevision is required");
        let huge = "a".repeat(2 * 1024 * 1024 + 1);
        let oversized = call(
            window,
            cx,
            "vault.write",
            json!({"path": "beta.md", "body": huge, "ifRevision": "abc"}),
        );
        assert_eq!(oversized["error"], "Note exceeds the 2 MiB limit");
        let long = "a".repeat(4097);
        let path = call(window, cx, "vault.read", json!({"path": long}));
        assert_eq!(path["error"], "path is required");
    }
}
