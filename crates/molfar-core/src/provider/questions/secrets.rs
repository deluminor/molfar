use super::*;

#[test]
fn secret_answer_written_to_provider_reply() {
    use crate::secrets::{ephemeral::SecretAnswers, SecretStore, SecretValue};

    let value = "123fixture-token";
    let request = json!({
        "input":{"questions":[{"id":"token","question":"Token?","isSecret":true,"options":["ignored"]}]},
    });
    let output_path = [
        ("claude", "/response/response/updatedInput/answers/Token?"),
        ("codex", "/result/answers/token/answers/0"),
        ("grok", "/result/answers/Token?"),
        ("pi", "/value"),
    ];
    for (kind, path) in output_path {
        let mut p = Protocol::new(Request {
            kind: Kind::Codex,
            binary: "unused".into(),
            cwd: ".".into(),
            prompt: "Prompt".into(),
            provider_id: None,
            model: None,
            settings: Default::default(),
        });
        let mut events = Vec::new();
        let mut wire = Vec::new();
        let request = if kind == "pi" {
            json!({"id":"token","title":"Token?","isSecret":true})
        } else {
            request.clone()
        };
        p.question(json!(1), kind, request, &mut events, &mut wire)
            .unwrap();
        let Event::Question(question) = &events[0] else {
            panic!("Expected question")
        };
        assert!(question.has_secret());
        assert!(question.items[0].options.is_empty());
        assert_eq!(question.auto_resolve_at, None);

        let mut secrets = SecretAnswers::default();
        secrets.push(0, SecretValue::one_time(value.into()).unwrap(), None);
        let decision = Decision::AnswerWithSecrets {
            answers: vec![],
            secrets,
        };
        assert!(!format!("{decision:?}").contains(value));
        p.respond(
            Control {
                id: question.id.clone(),
                decision,
            },
            &mut wire,
        )
        .unwrap();
        let output: Value = serde_json::from_slice(&wire).unwrap();
        assert_eq!(output.pointer(path).unwrap(), value, "{kind}");
        let notes = p.secret_reply_events.pop().unwrap();
        assert!(
            matches!(notes, Event::SecretAnswered(items) if items == ["Token? — answered (secret)"])
        );
        let db = crate::store::Store::open(Path::new(":memory:")).unwrap();
        let store = SecretStore::default();
        let redact = store
            .redactor(&db, None)
            .unwrap()
            .with_ephemeral(p.request.settings.secret_answers);
        assert_eq!(
            redact.text(&format!("echoed {value}")),
            "echoed [secret:TOKEN]"
        );
    }
}

#[test]
fn codex_async_secret_is_rejected() {
    let mut p = Protocol::new(Request {
        kind: Kind::Codex,
        binary: "unused".into(),
        cwd: ".".into(),
        prompt: "Prompt".into(),
        provider_id: None,
        model: None,
        settings: Default::default(),
    });
    let mut events = Vec::new();
    let mut wire = Vec::new();
    p.codex_async_questions(&json!({"params":{"item":{"id":"item","type":"agentMessage","delivery":"async","questions":[{"title":"Token?","isSecret":true}]}}}), &mut events, &mut wire).unwrap();
    assert!(matches!(events.as_slice(), [Event::Status(_)]));
    assert!(wire.is_empty());
}

#[test]
fn cursor_secret_question_is_rejected() {
    let mut p = Protocol::new(Request {
        kind: Kind::Cursor,
        binary: "unused".into(),
        cwd: ".".into(),
        prompt: "Prompt".into(),
        provider_id: None,
        model: None,
        settings: Default::default(),
    });
    let mut events = Vec::new();
    let mut wire = Vec::new();
    p.question(
        json!(1),
        "cursor",
        json!({"questions":[{"id":"token","prompt":"Token?","isSecret":true}]}),
        &mut events,
        &mut wire,
    )
    .unwrap();
    assert!(matches!(events.as_slice(), [Event::Status(_)]));
    assert_eq!(
        serde_json::from_slice::<Value>(&wire).unwrap()["result"]["outcome"]["outcome"],
        "skipped"
    );
}
