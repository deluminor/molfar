use molfar_core::external_mcp::types::SCOPE;

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct ExternalStatus {
    pub enabled: bool,
    pub port: u16,
    /// The address actually listening, absent while off or after a failure.
    pub endpoint: Option<String>,
    pub error: Option<String>,
    pub clients: Vec<ExternalClientRow>,
    /// A just-created credential as (client name, token); shown until dismissed.
    pub new_key: Option<(String, String)>,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ExternalClientRow {
    pub id: String,
    pub name: String,
    pub scopes: Vec<SCOPE>,
    pub projects: Vec<String>,
}
