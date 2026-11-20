use crate::transcript::Row;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{load, save, Error, Scope, SecretName, SecretStore, Status, Store};

pub const REQUEST: &str = "secrets.request";
pub const LIST: &str = "secrets.list";
pub const SECRET_REQUEST_ROLE: &str = "secret-request";
const MAX_REASON_CHARS: usize = 500;

pub fn parse_request(input: &Value) -> Result<(SecretName, String), String> {
    let name = SecretName::parse(input["name"].as_str().unwrap_or_default())
        .map_err(|error| error.to_string())?;
    let reason = input["reason"].as_str().unwrap_or_default();
    let reason = reason.split_whitespace().collect::<Vec<_>>().join(" ");
    if reason.is_empty() || reason.chars().count() > MAX_REASON_CHARS {
        return Err("Provide a reason of 1–500 characters.".into());
    }
    Ok((name, reason))
}

pub fn list(store: &SecretStore, db: &Store, scope: Option<Scope>) -> Result<Value, String> {
    let scopes: Vec<_> = super::scopes_for(scope).collect();
    let entries = store.list(db).map_err(|error| error.to_string())?;
    Ok(Value::Array(entries.into_iter()
        .filter(|entry| scopes.contains(&entry.scope))
        .map(|entry| serde_json::json!({
            "name": entry.name.as_str(), "scope": entry.scope.to_string(), "createdAt": entry.created_at,
        })).collect()))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Open,
    Saved,
    Cancelled,
    Exists,
    Expired,
}

impl RequestStatus {
    pub fn label(self) -> &'static str {
        match self {
            Self::Open => "Answer on desktop",
            Self::Saved => "Saved",
            Self::Cancelled => "Cancelled",
            Self::Exists => "Already exists. Use Replace in Settings.",
            Self::Expired => "Expired",
        }
    }
}

impl From<Status> for RequestStatus {
    fn from(status: Status) -> Self {
        match status {
            Status::Saved => Self::Saved,
            Status::Cancelled | Status::Unavailable => Self::Cancelled,
            Status::Exists => Self::Exists,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecretRequest {
    pub request_id: String,
    pub session: i64,
    pub agent: String,
    pub name: SecretName,
    pub scope: Scope,
    pub reason: String,
    pub status: RequestStatus,
    pub time: u64,
}

impl SecretRequest {
    pub fn prepare(
        mut self,
        store: &SecretStore,
        db: &Store,
        ephemeral: super::ephemeral::Ephemeral,
    ) -> Result<Result<Self, Status>, String> {
        if store.probe().is_err() {
            return Ok(Err(Status::Unavailable));
        }
        let entries = store.list(db).map_err(|error| error.to_string())?;
        if entries
            .iter()
            .any(|entry| entry.scope == self.scope && entry.name == self.name)
        {
            return Ok(Err(Status::Exists));
        }
        let redactor = store
            .redactor(db, Some(self.scope.clone()))
            .map_err(|error| error.to_string())?
            .with_ephemeral(ephemeral);
        redactor.scrub(&mut self.agent);
        redactor.scrub(&mut self.reason);
        Ok(Ok(self))
    }

    pub fn history(store: &Store, session: i64) -> Result<Vec<SecretRequest>, Error> {
        let rows: Vec<Row> = load(store, &history_key(session))?;
        let mut history = rows
            .into_iter()
            .map(|row| {
                if row.role != SECRET_REQUEST_ROLE {
                    return Err(Error::Index);
                }
                serde_json::from_str::<Self>(&row.text).map_err(|_| Error::Index)
            })
            .collect::<Result<Vec<_>, _>>()?;
        for request in &mut history {
            if request.status == RequestStatus::Open {
                request.status = RequestStatus::Expired;
            }
        }
        Ok(history)
    }

    pub fn persist(&self, store: &Store) -> Result<(), Error> {
        let mut history = Self::history(store, self.session)?;
        if let Some(previous) = history
            .iter_mut()
            .find(|row| row.request_id == self.request_id)
        {
            *previous = self.clone();
        } else {
            history.push(self.clone());
        }
        let rows = history
            .into_iter()
            .map(|request| {
                Ok(Row {
                    role: SECRET_REQUEST_ROLE.into(),
                    text: serde_json::to_string(&request).map_err(|_| Error::Index)?,
                    first: true,
                    sent_at: Some(request.time),
                })
            })
            .collect::<Result<Vec<_>, Error>>()?;
        save(store, &history_key(self.session), &rows)
    }

    pub fn notice(&self) -> String {
        let status = if self.status == RequestStatus::Open {
            "answer on desktop"
        } else {
            self.status.label()
        };
        format!("Secret request {} — {status}", self.name.as_str())
    }
}

pub(crate) fn history_key(session: i64) -> String {
    format!("{SECRET_REQUEST_ROLE}:{session}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_rejects_an_explicit_scope_and_normalizes_the_reason() {
        let input = serde_json::json!({"name": "API_KEY", "reason": " Use\n  this key "});
        crate::app_access::validate_operator(REQUEST, &input).unwrap();
        assert_eq!(parse_request(&input).unwrap().1, "Use this key");
        let input =
            serde_json::json!({"name": "API_KEY", "reason": "Run tests", "scope": "global"});
        assert!(crate::app_access::validate_operator(REQUEST, &input).is_err());
    }

    #[test]
    fn reload_marks_open_request_expired_and_updates_the_same_record() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut request = SecretRequest {
            request_id: "request-id".into(),
            session: 1,
            agent: "Agent".into(),
            name: SecretName::parse("API_KEY").unwrap(),
            scope: Scope::Project("project-id".into()),
            reason: "Run tests".into(),
            status: RequestStatus::Open,
            time: 1,
        };
        request.persist(&db).unwrap();
        assert_eq!(
            SecretRequest::history(&db, 1).unwrap()[0].status,
            RequestStatus::Expired
        );
        request.status = RequestStatus::Saved;
        request.persist(&db).unwrap();
        assert_eq!(SecretRequest::history(&db, 1).unwrap(), [request]);
    }
}
