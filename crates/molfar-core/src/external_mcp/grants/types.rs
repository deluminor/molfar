use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum DOMAIN {
    Board,
    Sessions,
    Notes,
    Knowledge,
    Automations,
    Inbox,
    Familiars,
    Jira,
    Confluence,
}

impl DOMAIN {
    pub const ALL: [Self; 9] = [
        Self::Board,
        Self::Sessions,
        Self::Notes,
        Self::Knowledge,
        Self::Automations,
        Self::Inbox,
        Self::Familiars,
        Self::Jira,
        Self::Confluence,
    ];

    pub fn allows_write(self) -> bool {
        self != Self::Confluence
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Board => "Board",
            Self::Sessions => "Sessions",
            Self::Notes => "Notes",
            Self::Knowledge => "Knowledge",
            Self::Automations => "Automations",
            Self::Inbox => "Inbox",
            Self::Familiars => "Familiars",
            Self::Jira => "Jira",
            Self::Confluence => "Confluence",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(try_from = "String", into = "String")]
pub enum GRANT {
    Read(DOMAIN),
    Write(DOMAIN),
    BoardCreate,
    BoardRun,
    SessionsStop,
    SessionsOperator,
    Destructive,
    Delegated,
}

impl GRANT {
    pub const ACTIONS: [Self; 4] = [
        Self::BoardCreate,
        Self::BoardRun,
        Self::SessionsStop,
        Self::SessionsOperator,
    ];
    pub const FLAGS: [Self; 2] = [Self::Destructive, Self::Delegated];
}

impl From<GRANT> for String {
    fn from(grant: GRANT) -> Self {
        match grant {
            GRANT::Read(domain) => format!("{}:read", domain.label().to_ascii_lowercase()),
            GRANT::Write(domain) => format!("{}:write", domain.label().to_ascii_lowercase()),
            GRANT::BoardCreate => "board:create".into(),
            GRANT::BoardRun => "board:run".into(),
            GRANT::SessionsOperator => "sessions:operator".into(),
            GRANT::SessionsStop => "sessions:stop".into(),
            GRANT::Destructive => "destructive".into(),
            GRANT::Delegated => "delegated".into(),
        }
    }
}

impl TryFrom<String> for GRANT {
    type Error = &'static str;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        let actions = Self::ACTIONS.into_iter().chain(Self::FLAGS);
        let domains = DOMAIN::ALL.into_iter().flat_map(|domain| {
            std::iter::once(Self::Read(domain))
                .chain(domain.allows_write().then_some(Self::Write(domain)))
        });
        actions
            .chain(domains)
            .find(|grant| String::from(*grant) == value)
            .ok_or("Unknown external MCP grant")
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RESOURCE {
    Vault,
    InboxProvider,
    Familiar,
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct ResourceGrant {
    pub kind: RESOURCE,
    pub id: String,
}

pub struct ClientUpdate<'a> {
    pub name: Option<&'a str>,
    pub grants: &'a [GRANT],
    pub projects: &'a [String],
    pub resources: &'a [ResourceGrant],
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ACCESS {
    #[default]
    Standard,
    Destructive,
    Delegated,
}

#[derive(Clone, Copy)]
pub struct Requirement {
    pub any: &'static [GRANT],
    pub access: ACCESS,
}

impl Requirement {
    pub const fn standard(any: &'static [GRANT]) -> Self {
        Self {
            any,
            access: ACCESS::Standard,
        }
    }
}
