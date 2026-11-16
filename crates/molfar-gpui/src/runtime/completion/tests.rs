use super::classify;
use molfar_core::agent::turn::TurnCompletion;

#[test]
fn provider_result_and_intentional_cancel_are_distinct() {
    assert_eq!(
        classify(100, false, None, None, None),
        TurnCompletion::Succeeded { completed_at: 100 }
    );
    assert_eq!(
        classify(101, false, Some("Provider failed"), None, None),
        TurnCompletion::Failed {
            completed_at: 101,
            error: "Provider failed".into(),
        }
    );
    assert_eq!(
        classify(102, true, Some("Stopped"), None, None),
        TurnCompletion::Cancelled { completed_at: 102 }
    );
}

#[test]
fn final_storage_failure_prevents_success_and_overrides_cancel() {
    for cancelled in [false, true] {
        assert_eq!(
            classify(200, cancelled, None, Some("disk full"), None),
            TurnCompletion::Failed {
                completed_at: 200,
                error: "Saving transcript failed: disk full".into(),
            }
        );
        assert_eq!(
            classify(201, cancelled, None, None, Some("handoff locked")),
            TurnCompletion::Failed {
                completed_at: 201,
                error: "Saving handoff failed: handoff locked".into(),
            }
        );
    }
}

#[test]
fn multiple_final_storage_failures_retain_both_contexts() {
    assert_eq!(
        classify(
            300,
            false,
            Some("provider failed"),
            Some("disk full"),
            Some("locked")
        ),
        TurnCompletion::Failed {
            completed_at: 300,
            error: "Saving transcript failed: disk full · Saving handoff failed: locked".into(),
        }
    );
}
