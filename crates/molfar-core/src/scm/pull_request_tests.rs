use std::collections::VecDeque;
use std::path::Path;

use super::super::cli::{Captured, Cli};
use super::super::forge::Forge;
use super::super::request_status::{github_status, gitlab_status, parse_glab_list};
use super::create;

struct Script {
    calls: Vec<(String, Vec<String>)>,
    next: VecDeque<Result<Captured, String>>,
    body: Option<String>,
    file: Option<String>,
}

impl Script {
    fn ok(stdout: &str) -> Self {
        Self::with(Ok(Captured {
            stdout: stdout.into(),
            stderr: String::new(),
            ok: true,
        }))
    }

    fn with(result: Result<Captured, String>) -> Self {
        let mut next = VecDeque::new();
        next.push_back(result);
        Self {
            calls: Vec::new(),
            next,
            body: None,
            file: None,
        }
    }
}

impl Cli for Script {
    fn run(&mut self, program: &str, args: &[String]) -> Result<Captured, String> {
        self.calls.push((program.to_owned(), args.to_vec()));
        if let Some(index) = args
            .iter()
            .position(|arg| arg == "--body-file" || arg == "--description-file")
        {
            self.file = args.get(index + 1).cloned();
            self.body = self
                .file
                .as_deref()
                .and_then(|path| std::fs::read_to_string(path).ok());
        }
        self.next
            .pop_front()
            .unwrap_or_else(|| Err("no scripted result".into()))
    }
}

fn flag<'a>(args: &'a [String], name: &str) -> &'a str {
    let index = args.iter().position(|arg| arg == name).unwrap();
    args[index + 1].as_str()
}

#[test]
fn github_create_keeps_todays_arguments_and_does_not_start_glab() {
    let mut cli = Script::ok("remote: done\nhttps://github.com/o/r/pull/4\n");
    let url = create(
        &mut cli,
        Forge::GitHub,
        "Title",
        " Body ",
        "main",
        "feature",
    )
    .unwrap();

    assert_eq!(url, "https://github.com/o/r/pull/4");
    assert_eq!(cli.calls.len(), 1);
    assert_eq!(cli.calls[0].0, "gh");
    let args = &cli.calls[0].1;
    assert_eq!(&args[..4], ["pr", "create", "--title", "Title"]);
    assert_eq!(flag(args, "--base"), "main");
    assert_eq!(flag(args, "--head"), "feature");
    assert_eq!(cli.body.as_deref(), Some("Body"));
    assert!(!Path::new(cli.file.as_deref().unwrap()).exists());
}

#[test]
fn gitlab_create_binds_head_to_source_and_base_to_target() {
    let mut cli = Script::ok("https://gitlab.com/g/p/-/merge_requests/8\n");
    let url = create(&mut cli, Forge::GitLab, "Title", "notes", "main", "feature").unwrap();

    assert_eq!(url, "https://gitlab.com/g/p/-/merge_requests/8");
    assert_eq!(cli.calls[0].0, "glab");
    assert!(cli.calls.iter().all(|(program, _)| program != "gh"));
    let args = &cli.calls[0].1;
    assert_eq!(args[0], "mr");
    assert_eq!(args[1], "create");
    assert!(args.iter().any(|arg| arg == "--yes"));
    assert!(!args
        .iter()
        .any(|arg| arg == "--push" || arg == "--fill" || arg == "--web"));
    assert_eq!(flag(args, "--source-branch"), "feature");
    assert_eq!(flag(args, "--target-branch"), "main");
    assert!(!Path::new(cli.file.as_deref().unwrap()).exists());
}

#[test]
fn an_empty_title_starts_no_cli() {
    let mut cli = Script::ok("");
    let error = create(&mut cli, Forge::GitLab, "  ", "body", "main", "feature").unwrap_err();
    assert_eq!(error, "Pull request title cannot be empty");
    assert!(cli.calls.is_empty());
}

#[test]
fn missing_glab_and_auth_failure_name_gitlab_and_do_not_start_gh() {
    let mut missing = Script::with(Err("GitLab CLI (`glab`) is not installed.".into()));
    let error = create(&mut missing, Forge::GitLab, "Title", "", "main", "feature").unwrap_err();
    assert!(error.contains("glab") || error.contains("GitLab"));
    assert!(!error.contains("known GitHub host"));
    assert!(missing.calls.iter().all(|(program, _)| program != "gh"));

    let mut auth = Script::with(Ok(Captured {
        stdout: String::new(),
        stderr: "401 Unauthorized".into(),
        ok: false,
    }));
    let error = create(&mut auth, Forge::GitLab, "Title", "", "main", "feature").unwrap_err();
    assert!(error.contains("glab") || error.contains("GitLab"));
    assert!(error.contains("401 Unauthorized"));
    assert!(!error.contains("known GitHub host"));
    assert!(auth.calls.iter().all(|(program, _)| program != "gh"));
}

#[test]
fn empty_cli_output_names_the_missing_url() {
    let mut github = Script::ok("  \n");
    assert_eq!(
        create(&mut github, Forge::GitHub, "Title", "", "main", "feature").unwrap_err(),
        "gh returned no pull request URL"
    );
    let mut gitlab = Script::ok("");
    assert_eq!(
        create(&mut gitlab, Forge::GitLab, "Title", "", "main", "feature").unwrap_err(),
        "glab returned no merge request URL"
    );
}

#[test]
fn an_open_gitlab_row_wins_and_uses_the_iid() {
    let json = r#"[
        {"id":99,"iid":7,"title":"Open me","web_url":"https://gitlab.com/g/p/-/merge_requests/7","state":"opened","draft":true},
        {"id":100,"iid":3,"title":"Old","web_url":"https://gitlab.com/g/p/-/merge_requests/3","state":"closed"}
    ]"#;
    let pr = parse_glab_list(json).unwrap();
    assert_eq!(pr.number, 7);
    assert_eq!(pr.state, "open");
    assert_eq!(pr.title, "Open me");

    let closed = r#"[{"id":5,"iid":3,"title":"Old","web_url":"https://gitlab.com/g/p/-/merge_requests/3","state":"locked"}]"#;
    assert_eq!(parse_glab_list(closed).unwrap().state, "closed");
    assert_eq!(parse_glab_list("[]"), None);
    assert_eq!(
        parse_glab_list(
            r#"[{"id":8,"iid":0,"title":"Zero","web_url":"https://gitlab.com/g/p/-/merge_requests/0","state":"opened"}]"#
        ),
        None
    );
}

#[test]
fn gitlab_status_lists_by_source_branch_and_a_failure_is_an_error() {
    let mut cli = Script::ok(
        r#"[{"iid":4,"title":"MR","web_url":"https://gitlab.com/g/p/-/merge_requests/4","state":"opened"}]"#,
    );
    let pr = gitlab_status(&mut cli, "feature").unwrap().unwrap();
    assert_eq!(pr.number, 4);
    assert_eq!(pr.state, "open");
    assert_eq!(
        &cli.calls[0].1[..4],
        ["mr", "list", "--source-branch", "feature"]
    );

    let mut failed = Script::with(Ok(Captured {
        stdout: String::new(),
        stderr: "nope".into(),
        ok: false,
    }));
    assert!(gitlab_status(&mut failed, "feature").is_err());
    assert!(github_status(&mut failed, "feature", "acme").is_err());
}
