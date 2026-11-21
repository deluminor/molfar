use super::{
    classify, decide, parse_gh_hosts, parse_glab_hosts, preferred_remote, remote_host, Forge,
    GH_AUTH, GLAB_AUTH, NO_REMOTE, UNKNOWN_FORGE,
};

fn hosts(names: &[&str]) -> Vec<String> {
    names.iter().map(|name| (*name).to_string()).collect()
}

#[test]
fn saas_hosts_are_classified_without_an_auth_list() {
    assert_eq!(classify("github.com", &[], &[]), Forge::GitHub);
    assert_eq!(classify("WWW.GitHub.com", &[], &[]), Forge::GitHub);
    assert_eq!(classify("gitlab.com", &[], &[]), Forge::GitLab);
    assert_eq!(classify("www.gitlab.com", &[], &[]), Forge::GitLab);
}

#[test]
fn remote_urls_yield_the_host_without_userinfo_or_port() {
    assert_eq!(
        remote_host("git@gitlab.com:group/sub/repo.git"),
        Some("gitlab.com".into())
    );
    assert_eq!(
        remote_host("ssh://git@gitlab.com:2222/group/sub/repo.git"),
        Some("gitlab.com".into())
    );
    assert_eq!(
        remote_host("https://token@gitlab.monly.io/group/repo.git"),
        Some("gitlab.monly.io".into())
    );
    assert_eq!(
        remote_host("http://github.com/o/r.git/"),
        Some("github.com".into())
    );
    assert_eq!(remote_host("/srv/git/r.git"), None);
}

#[test]
fn gitlab_label_and_auth_lists_classify_custom_hosts() {
    assert_eq!(classify("gitlab.monly.io", &[], &[]), Forge::GitLab);
    assert_eq!(
        classify("git.example.com", &[], &hosts(&["git.example.com"])),
        Forge::GitLab
    );
    assert_eq!(
        classify("git.example.com", &hosts(&["git.example.com"]), &[]),
        Forge::GitHub
    );
    assert_eq!(
        classify(
            "git.example.com",
            &hosts(&["git.example.com"]),
            &hosts(&["git.example.com"])
        ),
        Forge::Unknown
    );
    assert_eq!(classify("git.example.com", &[], &[]), Forge::Unknown);
}

#[test]
fn auth_output_lists_hosts_and_keeps_a_failed_glab_check() {
    assert_eq!(
        parse_gh_hosts(r#"{"hosts":{"GitHub.example.com":[{"state":"success"}]}}"#),
        hosts(&["github.example.com"])
    );
    assert!(parse_gh_hosts("not json").is_empty());
    let glab = "\
gitlab.example.com
  x gitlab.example.com: API call failed: 401
git.example.com
  ✓ Logged in
! No token
";
    assert_eq!(
        parse_glab_hosts(glab),
        hosts(&["gitlab.example.com", "git.example.com"])
    );
}

#[test]
fn upstream_wins_and_a_missing_upstream_uses_origin() {
    let names = hosts(&["upstream", "origin"]);
    assert_eq!(
        preferred_remote(Some("gitlab/feature/name"), &names).as_deref(),
        Some("gitlab")
    );
    assert_eq!(preferred_remote(None, &names).as_deref(), Some("origin"));
    assert_eq!(
        preferred_remote(None, &hosts(&["fork"])).as_deref(),
        Some("fork")
    );
    assert_eq!(preferred_remote(None, &[]), None);
}

#[test]
fn the_preferred_remote_is_the_only_one_classified() {
    let listing = "\
origin\tgit@github.com:acme/app.git (fetch)
origin\tgit@github.com:acme/app.git (push)
gitlab\tgit@gitlab.monly.io:acme/app.git (fetch)
";
    assert_eq!(
        decide(Some("gitlab/feature/name"), listing, &[], &[]).unwrap(),
        Forge::GitLab
    );
    assert_eq!(decide(None, listing, &[], &[]).unwrap(), Forge::GitHub);
    assert_eq!(decide(None, "", &[], &[]).unwrap_err(), NO_REMOTE);
}

#[test]
fn an_unknown_host_names_both_clis() {
    assert!(UNKNOWN_FORGE.contains("gh"));
    assert!(UNKNOWN_FORGE.contains("glab"));
    assert!(!UNKNOWN_FORGE.contains("known GitHub host"));
}

#[test]
fn auth_queries_do_not_ask_for_a_token() {
    assert!(GH_AUTH.iter().all(|arg| *arg != "--show-token"));
    assert!(GLAB_AUTH.iter().all(|arg| *arg != "--show-token"));
}
