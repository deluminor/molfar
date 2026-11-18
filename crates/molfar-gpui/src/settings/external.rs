use molfar_core::external_mcp::grants::types::GRANT;

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct ExternalStatus {
    pub enabled: bool,
    pub port: u16,
    /// The address actually listening, absent while off or after a failure.
    pub endpoint: Option<String>,
    pub error: Option<String>,
    pub default_name: String,
    pub clients: Vec<ExternalClientRow>,
    /// A just-created credential as (client name, token); shown until dismissed.
    pub new_key: Option<(String, String)>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ExternalClientRow {
    pub id: String,
    pub name: String,
    pub grants: Vec<GRANT>,
    pub created_at: i64,
    pub resources_count: usize,
    pub projects: Vec<String>,
}
