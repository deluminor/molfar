use super::types::{DOMAIN, GRANT};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
#[allow(clippy::upper_case_acronyms)]
pub(super) enum SCOPE {
    Read,
    Submit,
    Stop,
    #[serde(other)]
    Unknown,
}

pub(super) fn from_legacy(scopes: &[SCOPE]) -> Vec<GRANT> {
    let mut grants = Vec::new();
    for scope in scopes {
        let mapped: &[GRANT] = match scope {
            SCOPE::Read => &[GRANT::Read(DOMAIN::Board), GRANT::Read(DOMAIN::Sessions)],
            SCOPE::Submit => &[GRANT::Write(DOMAIN::Sessions), GRANT::BoardCreate],
            SCOPE::Stop => &[GRANT::SessionsStop],
            SCOPE::Unknown => &[],
        };
        for &grant in mapped {
            if !grants.contains(&grant) {
                grants.push(grant);
            }
        }
    }

    grants
}
