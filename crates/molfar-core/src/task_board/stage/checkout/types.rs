#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RetainedCheckout {
    pub path: String,
    pub branch: String,
    pub base_ref: String,
    pub base_sha: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckoutSnapshot {
    pub head: String,
    pub porcelain: String,
    pub fingerprint: String,
}
