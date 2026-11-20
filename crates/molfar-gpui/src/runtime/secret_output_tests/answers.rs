use super::*;
use molfar_core::{
    agent::Decision,
    secrets::{
        bind::{self, ProjectBindings, SecretBinding},
        ephemeral::SecretAnswers,
    },
};

const PIN: &str = "830297";
const TOKEN: &str = "fixture-masked-answer";
const BOUND: &str = "fixture-spawn-credential";

#[test]
fn masked_answers_and_bound_env_are_redacted_before_persistence() {
    let fixture = Fixture(
        std::env::temp_dir().join(format!("molfar-secret-answer-{}", uuid::Uuid::new_v4())),
    );
    let app_data = fixture.0.join("data");
    fs::create_dir_all(&app_data).unwrap();
    let binary = fixture.0.join("provider");
    fs::write(&binary, include_str!("answers.py")).unwrap();
    fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();
    let db = Store::open_desktop(&app_data.join("sessions.db")).unwrap();
    let summary = db.create("codex", fixture.0.to_str().unwrap()).unwrap();
    let id = summary.id;
    let secrets = SecretStore::in_memory();
    let scope = secrets
        .project_scope(&db, &fixture.0, Some("Fixture"))
        .unwrap();
    let Scope::Project(project) = &scope else {
        panic!("Expected project scope")
    };
    secrets
        .create(
            &db,
            scope.clone(),
            SecretName::parse("BOUND").unwrap(),
            SecretValue::from_text(BOUND.into()).unwrap(),
        )
        .unwrap();
    let secret_id = secrets.list(&db).unwrap()[0].id.clone();
    bind::configure(
        &db,
        project,
        ProjectBindings {
            enabled: true,
            items: vec![SecretBinding {
                env: SecretName::parse("FIXTURE_BINDING").unwrap(),
                secret_id,
            }],
        },
    )
    .unwrap();

    let store = Arc::new(Mutex::new(db));
    let worker_store = store.clone();
    let worker_secrets = secrets.clone();
    let (updates, receive) = async_channel::bounded(32);
    let (controls, incoming) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        run_turn_using(
            TurnInput {
                summary,
                prompt: "Run the fixture".into(),
                settings: Settings::default(),
                secrets: worker_secrets,
            },
            incoming,
            worker_store,
            Arc::new(AtomicBool::new(false)),
            updates,
            |_| Some(binary),
        );
    });
    let mut answered = false;
    let mut finished = false;
    while let Ok(update) = receive.recv_blocking() {
        for row in &update.rows {
            for value in [PIN, TOKEN, BOUND] {
                assert!(!row.text.contains(value), "Live row leaked a fixture value");
            }
        }
        for question in update.questions {
            assert!(question.items.iter().all(|item| item.secret));
            let mut secrets = SecretAnswers::default();
            secrets.push(0, SecretValue::one_time(PIN.into()).unwrap(), None);
            secrets.push(1, SecretValue::one_time(TOKEN.into()).unwrap(), None);
            controls
                .send(Control {
                    id: question.id,
                    decision: Decision::AnswerWithSecrets {
                        answers: vec![],
                        secrets,
                    },
                })
                .unwrap();
            answered = true;
        }
        if update.finished {
            assert_eq!(update.status, "Ready");
            finished = true;
            break;
        }
    }
    worker.join().unwrap();
    assert!(answered && finished);
    let db = locked(&store).unwrap();
    let rows = serde_json::to_string(&db.load(id).unwrap().rows).unwrap();
    let external = db
        .app_conversation(id, &json!({}), false, false)
        .unwrap()
        .to_string();
    for value in [PIN, TOKEN, BOUND] {
        assert!(!rows.contains(value));
        assert!(!external.contains(value));
    }
    for marker in [
        "[secret:PIN]",
        "[secret:TOKEN]",
        "[secret:BOUND]",
        "answered (secret)",
    ] {
        assert!(rows.contains(marker), "Missing {marker}");
    }
    assert_eq!(secrets.list(&db).unwrap().len(), 1);
    assert_no_values(&app_data, &[PIN, TOKEN, BOUND]);
}
