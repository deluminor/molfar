use super::fixtures::conversation;
use super::*;
use molfar_core::consumption::UsageSnapshot;

#[test]
fn pending_consumption_survives_failed_flush_and_replaces_replay() {
    let (store, session, transcript) = conversation();
    let now = Instant::now();
    let mut pending = PendingSave::new(true, now);
    let mut usage = UsageSnapshot {
        provider: "claude".into(),
        source_key: "result-1".into(),
        model: None,
        reported_at_ms: Some(1000),
        input: Some(0),
        output: Some(u64::MAX),
        cache_read: None,
        cache_write: None,
    };
    pending.consumption(usage.clone());
    assert!(pending.due(true, now));
    assert!(
        pending
            .flush(&store, session, &transcript, &Default::default(), now)
            .is_err()
    );
    assert!(pending.due(true, now));
    usage.output = Some(7);
    pending.consumption(usage.clone());
    pending
        .flush(&store, session, &transcript, &Default::default(), now)
        .unwrap();
    assert!(!pending.due(true, now));
    pending.consumption(usage.clone());
    pending
        .flush(&store, session, &transcript, &Default::default(), now)
        .unwrap();
    assert_eq!(
        locked(&store)
            .unwrap()
            .session_consumption(session)
            .unwrap(),
        vec![usage]
    );
}
