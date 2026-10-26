use super::*;

#[test]
fn github_check_details_reads_steps_and_failure_annotations() {
    let details = github_check_details_with("acme/web", "123", |path| {
            match path {
                "repos/acme/web/actions/jobs/123" => Ok(r#"{
                    "id":123, "status":"completed", "conclusion":"failure",
                    "check_run_url":"https://api.github.com/repos/acme/web/check-runs/456",
                    "steps":[
                        {"name":"Install","status":"completed","conclusion":"success"},
                        {"name":"Run tests","status":"completed","conclusion":"failure",
                         "started_at":"2030-01-01T10:00:00Z","completed_at":"2030-01-01T10:00:12Z"}
                    ]
                }"#.into()),
                "repos/acme/web/check-runs/456/annotations?per_page=100" => Ok(r#"[
                    {"path":"src/app.test.ts","start_line":42,"message":"Expected 2, received 1","annotation_level":"failure"}
                ]"#.into()),
                _ => panic!("Unexpected request: {path}"),
            }
        }).unwrap();
    assert_eq!(details.steps[0].state, "pass");
    assert_eq!(details.steps[1].state, "fail");
    assert_eq!(details.steps[1].name, "Run tests");
    assert_eq!(details.annotations[0].message, "Expected 2, received 1");
    assert_eq!(details.annotations[0].line, 42);
    assert!(details.notice.is_none());
}
