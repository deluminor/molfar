use super::*;
use molfar_core::{
    secrets::{Scope, SecretName, SecretStore, SecretValue},
    task_board::stage::{agent::AgentStage, contracts::read_stage_output},
};
use serde_json::json;
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};

const OLD: &str = "fictional-old-value";
const NEW: &str = "fictional-new-value";

struct Fixture(PathBuf);

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn provider_output_redacts_live_and_persisted_rows_and_board_reply() {
    let fixture =
        Fixture(std::env::temp_dir().join(format!("molfar-redaction-{}", uuid::Uuid::new_v4())));
    let app_data = fixture.0.join("app-data");
    fs::create_dir_all(&app_data).unwrap();
    let binary = fixture.0.join("provider");
    fs::write(&binary, include_str!("secret_output_tests/provider.py")).unwrap();
    fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();
    let db = Store::open_desktop(&app_data.join("sessions.db")).unwrap();
    let summary = db.create("codex", fixture.0.to_str().unwrap()).unwrap();
    let id = summary.id;

    let secrets = SecretStore::in_memory();
    let store = Arc::new(Mutex::new(db));
    let worker_store = store.clone();
    let worker_secrets = secrets.clone();
    let (updates, receive) = async_channel::bounded(32);
    let (_controls, controls) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        run_turn_using(
            TurnInput {
                summary,
                prompt: "Run the fixture".into(),
                settings: Settings::default(),
                secrets: worker_secrets,
            },
            controls,
            worker_store,
            Arc::new(AtomicBool::new(false)),
            updates,
            |_| Some(binary),
        );
    });

    let mut settled = false;
    let mut saved = false;
    while let Ok(update) = receive.recv_blocking() {
        for row in &update.rows {
            assert!(!row.text.contains(OLD));
            assert!(!row.text.contains(NEW));
        }
        if !saved
            && update
                .rows
                .iter()
                .any(|row| row.text == "Waiting for fixture")
        {
            let db = locked(&store).unwrap();
            secrets
                .create(
                    &db,
                    Scope::Global,
                    SecretName::parse("TEST_KEY").unwrap(),
                    SecretValue::from_text(OLD.into()).unwrap(),
                )
                .unwrap();
            let entry = secrets.list(&db).unwrap().remove(0);
            secrets
                .replace(&db, &entry.id, SecretValue::from_text(NEW.into()).unwrap())
                .unwrap();
            fs::write(fixture.0.join(".env"), format!("TEST_KEY={NEW}\n")).unwrap();
            saved = true;
        }
        if update.finished {
            assert_eq!(update.status, "Ready");
            settled = true;
            break;
        }
    }
    worker.join().unwrap();
    assert!(saved && settled);

    let db = locked(&store).unwrap();
    let rows = db.load(id).unwrap().rows;
    let blocks = db.conversation_blocks(id).unwrap();
    let mcp_page = db.app_conversation(id, &json!({}), false, false).unwrap();
    for output in [
        serde_json::to_string(&rows).unwrap(),
        json!(blocks).to_string(),
        mcp_page.to_string(),
    ] {
        assert!(!output.contains(OLD));
        assert!(!output.contains(NEW));
        assert!(output.contains("[secret:TEST_KEY]"));
    }
    let tool = rows.iter().find(|row| row.role == "tool").unwrap();
    assert!(tool.text.matches("[secret:TEST_KEY]").count() >= 3);
    let reply = rows
        .iter()
        .filter(|row| row.role == "assistant")
        .map(|row| row.text.as_str())
        .collect::<String>();
    let report = read_stage_output(AgentStage::Implement, &reply).unwrap();
    assert!(format!("{report:?}").contains("[secret:TEST_KEY]"));

    assert_no_plaintext(&app_data);
}

fn assert_no_plaintext(path: &Path) {
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            assert_no_plaintext(&path);
        } else {
            let bytes = fs::read(path).unwrap();
            for secret in [OLD, NEW] {
                assert!(
                    !bytes
                        .windows(secret.len())
                        .any(|part| part == secret.as_bytes())
                );
            }
        }
    }
}
