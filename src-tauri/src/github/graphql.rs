use serde::Deserialize;

#[derive(Deserialize)]
pub(super) struct GithubGraphqlEnvelope {
    #[serde(default)]
    pub(super) data: Option<GithubGraphqlData>,
    #[serde(default)]
    pub(super) errors: Vec<GithubGraphqlError>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlError {
    #[serde(default)]
    pub(super) message: String,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlData {
    pub(super) repository: Option<GithubGraphqlRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlRepository {
    pub(super) issue: Option<GithubGraphqlIssue>,
    pub(super) pull_request: Option<GithubGraphqlPullRequest>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlIssue {
    #[serde(default)]
    pub(super) comments: GithubGraphqlNodes<GithubGraphqlComment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlPullRequest {
    #[serde(default)]
    pub(super) review_decision: Option<String>,
    #[serde(default)]
    pub(super) base_ref_name: String,
    #[serde(default)]
    pub(super) head_ref_name: String,
    #[serde(default)]
    pub(super) commits: GithubGraphqlNodes<GithubGraphqlCommitNode>,
    #[serde(default)]
    pub(super) comments: GithubGraphqlNodes<GithubGraphqlComment>,
    #[serde(default)]
    pub(super) reviews: GithubGraphqlNodes<GithubGraphqlReview>,
    #[serde(default)]
    pub(super) review_threads: GithubGraphqlNodes<GithubGraphqlReviewThread>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlCommitNode {
    pub(super) commit: GithubGraphqlCommit,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlCommit {
    #[serde(default)]
    pub(super) oid: String,
    #[serde(default)]
    pub(super) message_headline: String,
    #[serde(default)]
    pub(super) committed_date: String,
    #[serde(default)]
    pub(super) url: String,
    #[serde(default)]
    pub(super) author: Option<GithubGraphqlCommitAuthor>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlCommitAuthor {
    #[serde(default)]
    pub(super) name: String,
    #[serde(default)]
    pub(super) user: Option<GithubGraphqlActor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlNodes<T> {
    pub(super) total_count: i64,
    pub(super) nodes: Vec<T>,
}

impl<T> Default for GithubGraphqlNodes<T> {
    fn default() -> Self {
        Self {
            total_count: 0,
            nodes: Vec::new(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlComment {
    #[serde(default)]
    pub(super) id: String,
    #[serde(default)]
    pub(super) author: Option<GithubGraphqlActor>,
    #[serde(default)]
    pub(super) body: String,
    #[serde(default)]
    pub(super) created_at: String,
    #[serde(default)]
    pub(super) url: String,
    #[serde(default)]
    pub(super) is_minimized: bool,
    #[serde(default)]
    pub(super) path: String,
    #[serde(default)]
    pub(super) line: Option<i64>,
    #[serde(default)]
    pub(super) original_line: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlReview {
    #[serde(default)]
    pub(super) id: String,
    #[serde(default)]
    pub(super) author: Option<GithubGraphqlActor>,
    #[serde(default)]
    pub(super) body: String,
    #[serde(default)]
    pub(super) state: String,
    #[serde(default, rename = "submittedAt")]
    pub(super) submitted_at: Option<String>,
    #[serde(default)]
    pub(super) url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GithubGraphqlReviewThread {
    #[serde(default)]
    pub(super) id: String,
    #[serde(default)]
    pub(super) is_resolved: bool,
    #[serde(default)]
    pub(super) path: String,
    #[serde(default)]
    pub(super) comments: GithubGraphqlNodes<GithubGraphqlComment>,
}

#[derive(Deserialize)]
pub(super) struct GithubGraphqlActor {
    #[serde(default)]
    pub(super) login: String,
}
