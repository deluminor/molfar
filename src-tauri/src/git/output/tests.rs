use super::*;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::test_support::{git, init_git_commit, tmp};

#[test]
fn git_output_capped_keeps_queued_chunks_complete_and_ordered() {
    let dir = tmp("git-output-bounded-queue");
    // ~200 KiB, comfortably past the 128 KiB the reader queue can hold, so
    // the reader is guaranteed to park in `send` while the consumer is
    // behind. Every other cap test here uses a cap below a single 8 KiB
    // chunk, which never fills one queue slot and so cannot catch a lost,
    // duplicated, or reordered chunk.
    let body: String = (0..12_000).map(|index| format!("line {index}\n")).collect();
    if !init_git_commit(&dir.0, &[("many.txt", &body)]) {
        return;
    }

    let (full, truncated) =
        git_output_capped(&dir.0, &["show", ":many.txt"], 1 << 20, None).unwrap();
    assert!(!truncated);
    assert_eq!(full, body.as_bytes(), "queued chunks lost or reordered");

    // Spans several chunks and lands mid-line.
    let (capped, truncated) =
        git_output_capped(&dir.0, &["show", ":many.txt"], 24_576, None).unwrap();
    assert!(truncated);
    assert_eq!(capped, body.as_bytes()[..24_576]);
}

#[test]
fn git_output_capped_stops_before_buffering_the_rest() {
    let dir = tmp("git-output-capped");
    let big = "x".repeat(80_000);
    if !init_git_commit(&dir.0, &[("big.txt", &format!("{big}\n"))]) {
        return;
    }
    std::fs::write(dir.0.join("big.txt"), format!("y{big}\n")).unwrap();
    if !git(&dir.0, &["add", "."]) || !git(&dir.0, &["commit", "-m", "edit"]) {
        return;
    }
    let (bytes, truncated) =
        git_output_capped(&dir.0, &["diff", "HEAD~1", "HEAD"], 1024, None).unwrap();
    assert!(truncated);
    assert!(bytes.len() <= 1024);
    let (head, truncated) = git_output_capped(&dir.0, &["rev-parse", "HEAD"], 1024, None).unwrap();
    assert!(!truncated);
    assert!(!head.is_empty());
}

#[test]
fn git_output_capped_cancels_a_silent_child() {
    let dir = tmp("git-output-cancel-silent");
    if !init_git_commit(&dir.0, &[("a.txt", "a\n")]) {
        return;
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let setter = cancel.clone();
    let setter_thread = thread::spawn(move || {
        thread::sleep(Duration::from_millis(150));
        setter.store(true, Ordering::Release);
    });
    let started = Instant::now();

    let result = git_output_capped(
        &dir.0,
        &["-c", "alias.slow=!sleep 5", "slow"],
        1024,
        Some(&cancel),
    );
    setter_thread.join().unwrap();

    assert!(result.is_none());
    assert!(started.elapsed() < Duration::from_secs(3));
}
