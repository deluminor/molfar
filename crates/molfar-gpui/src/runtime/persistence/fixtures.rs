use super::*;

pub(super) fn conversation() -> (Database, i64, Transcript) {
    conversation_at(std::path::Path::new(":memory:"))
}

pub(super) fn conversation_at(path: &std::path::Path) -> (Database, i64, Transcript) {
    let mut store = Store::open_desktop(path).unwrap();
    let session = store.create("codex", "/project").unwrap();
    let mut transcript = Transcript::default();
    transcript.begin("user");
    transcript.append("Prompt");
    transcript.begin("assistant");
    store.write_rows(session.id, 0, &transcript.rows).unwrap();
    (Arc::new(Mutex::new(store)), session.id, transcript)
}
