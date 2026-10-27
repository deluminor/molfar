use super::*;

#[test]
fn github_star_status_distinguishes_a_missing_star_from_an_unavailable_check() {
    assert_eq!(
        github_star_status_from_result(Ok(String::new())),
        GitHubStarStatus::Starred
    );
    assert_eq!(
        github_star_status_from_result(Err("gh: Not Found (HTTP 404)".into())),
        GitHubStarStatus::NotStarred
    );
    assert_eq!(
        github_star_status_from_result(Err("GitHub CLI is not installed".into())),
        GitHubStarStatus::Unavailable
    );
}
