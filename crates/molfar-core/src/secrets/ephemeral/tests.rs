use super::*;

#[test]
fn short_answer_whole_token_redacted_at_every_stream_boundary() {
    let ephemeral = Ephemeral::default();
    ephemeral.register(
        provider_name("challenge.id"),
        SecretValue::one_time("123".into()).unwrap(),
    );
    let store = SecretStore::new(crate::secrets::backend::MemoryBackend::default());
    let db = Store::open(Path::new(":memory:")).unwrap();
    let redact = store.redactor(&db, None).unwrap().with_ephemeral(ephemeral);
    let source = "é123 123🙂 123β (123) 123";
    let expected =
        "é123 [secret:CHALLENGE_ID]🙂 123β ([secret:CHALLENGE_ID]) [secret:CHALLENGE_ID]";
    assert_eq!(redact.text(source), expected);
    for (offset, _) in source.char_indices() {
        let mut stream = crate::secrets::redact::StreamRedactor::default();
        let mut output = stream.push(&redact, &source[..offset]);
        output.push_str(&stream.push(&redact, &source[offset..]));
        output.push_str(&stream.finish(&redact));
        assert_eq!(output, expected, "at offset {offset}");
    }
}

use crate::{
    agent::{Question, QuestionItem},
    secrets::backend::MemoryBackend,
};

#[test]
fn optional_save_uses_scope_and_never_overwrites() {
    let db = Arc::new(Mutex::new(Store::open(Path::new(":memory:")).unwrap()));
    let store = SecretStore::new(MemoryBackend::default());
    let ephemeral = Ephemeral::for_session(
        db.clone(),
        store.clone(),
        ".".into(),
        Some("fixture".into()),
    );
    let question = Question {
        id: "fixture".into(),
        title: "Token".into(),
        auto_resolve_at: None,
        items: vec![QuestionItem {
            id: "token".into(),
            prompt: "Token?".into(),
            secret: true,
            allow_custom: true,
            multiple: false,
            options: vec![],
        }],
    };
    let name = provider_name("saved");
    let reply = |value: &str, save| {
        let mut answers = SecretAnswers::default();
        answers.push(0, SecretValue::one_time(value.into()).unwrap(), save);
        answers.register(&question, &ephemeral).unwrap();
        answers.metadata(&question, &ephemeral)
    };
    assert_eq!(
        reply("default-fixture-secret", None),
        ["Token? — answered (secret)"]
    );
    assert!(store.list(&db.lock().unwrap()).unwrap().is_empty());
    assert!(reply("saved-fixture-secret", Some(name.clone()))[0].ends_with("SAVED saved"));
    assert!(
        reply("other-fixture-secret", Some(name.clone()))[0].ends_with("SAVED exists, not saved")
    );
    let db = db.lock().unwrap();
    let scope = Scope::Familiar("fixture".into());
    assert_eq!(store.list(&db).unwrap()[0].scope, scope);
    let values = store.resolve_names(&db, &[scope], &[name]).unwrap();
    assert_eq!(values[0].0.expose_secret(), "saved-fixture-secret");
}
