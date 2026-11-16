use super::*;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[test]
fn github_rate_limit_blocks_other_commands_until_reset() {
    let backoff = Mutex::new(None);
    let error = "GraphQL: API rate limit already exceeded for user ID 1.";
    let mut calls = 0;
    let result = gh_with_backoff(&backoff, &["pr", "list"], false, |args, _| {
        calls += 1;
        if args[0] == "api" {
            Ok(r#"{"data":{"rateLimit":{"remaining":0,"resetAt":"2099-01-01T00:00:00Z"}}}"#.into())
        } else {
            Err(error.into())
        }
    });
    assert_eq!(result.unwrap_err(), error);
    assert_eq!(calls, 2);
    assert_eq!(
        gh_with_backoff(&backoff, &["issue", "view", "42"], false, |_, _| {
            panic!("No command may reach GitHub before the reset")
        })
        .unwrap_err(),
        error
    );
    backoff.lock().unwrap().as_mut().unwrap().until = SystemTime::now() - Duration::from_secs(1);
    assert_eq!(
        gh_with_backoff(&backoff, &["pr", "list"], false, |_, _| Ok("fresh".into())).unwrap(),
        "fresh"
    );
    assert!(backoff.lock().unwrap().is_none());
}

#[test]
fn github_rate_limit_probe_failure_still_pauses_requests() {
    let backoff = Mutex::new(None);
    let mut calls = 0;
    assert!(gh_with_backoff(&backoff, &["pr", "list"], false, |_, _| {
        calls += 1;
        if calls == 1 {
            Err("GraphQL: API rate limit already exceeded".into())
        } else {
            Err("offline".into())
        }
    })
    .is_err());
    assert_eq!(calls, 2);
    assert!(gh_with_backoff(&backoff, &["pr", "view"], false, |_, _| {
        panic!("A failed reset lookup must not cause a request storm")
    })
    .is_err());
}

#[test]
fn github_secondary_rate_limit_pauses_without_a_quota_probe() {
    let backoff = Mutex::new(None);
    let mut calls = 0;
    assert!(gh_with_backoff(&backoff, &["pr", "list"], false, |_, _| {
        calls += 1;
        Err("You have exceeded a secondary rate limit".into())
    })
    .is_err());
    assert_eq!(calls, 1);
    assert!(backoff.lock().unwrap().is_some());
}

#[test]
fn github_network_errors_do_not_pause_other_commands() {
    let backoff = Mutex::new(None);
    assert!(gh_with_backoff(&backoff, &["pr", "list"], false, |_, _| {
        Err("error connecting to api.github.com".into())
    })
    .is_err());
    assert!(backoff.lock().unwrap().is_none());
    assert!(gh_with_backoff(&backoff, &["pr", "view"], false, |_, _| {
        Ok("fresh".into())
    })
    .is_ok());
}

#[test]
fn github_rate_limit_reset_parser_requires_valid_quota_data() {
    let reset = parse_github_rate_limit_backoff(
        r#"{"data":{"rateLimit":{"remaining":0,"resetAt":"2026-10-06T13:48:40Z"}}}"#,
    )
    .unwrap()
    .unwrap();
    assert_eq!(reset, UNIX_EPOCH + Duration::from_secs(1791294521));
    assert!(
        parse_github_rate_limit_backoff(r#"{"data":{"rateLimit":{"remaining":10}}}"#)
            .unwrap()
            .is_none()
    );
    assert!(parse_github_rate_limit_backoff(r#"{"errors":[{"message":"offline"}]}"#).is_err());
    assert!(parse_github_rate_limit_backoff(
        r#"{"data":{"rateLimit":{"remaining":0,"resetAt":"invalid"}}}"#
    )
    .is_err());
}
