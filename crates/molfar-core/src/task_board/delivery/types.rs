use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DeliveryMethod {
    Pr,
    Merge,
    Keep,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub method: DeliveryMethod,
    pub delivered_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr_url: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub merged: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PullRequestDocs<'a> {
    pub pr_description: Option<&'a str>,
    pub impl_report: Option<&'a str>,
    pub review: Option<&'a crate::task_board::stage::contracts::types::CodeReview>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PullRequest {
    pub title: String,
    pub body: String,
    pub base: String,
    pub head: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExistingPullRequest {
    pub url: String,
    pub merged: bool,
}
