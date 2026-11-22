use secrecy::SecretString;
use serde::{Deserialize, Serialize};

use super::{MAX_VALUE_BYTES, MIN_VALUE_BYTES};

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Global,
    Project(String),
    Familiar(String),
}

impl std::fmt::Display for Scope {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Global => formatter.write_str("global"),
            Self::Project(id) => write!(formatter, "project:{id}"),
            Self::Familiar(id) => write!(formatter, "familiar:{id}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String")]
pub struct SecretName(String);

impl SecretName {
    pub fn parse(value: impl Into<String>) -> Result<Self, Error> {
        let value = value.into();
        let mut bytes = value.bytes();
        if value.len() <= 64
            && bytes
                .next()
                .is_some_and(|b| b.is_ascii_uppercase() || b == b'_')
            && bytes.all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
        {
            return Ok(Self(value));
        }
        Err(Error::InvalidName)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for SecretName {
    type Error = Error;

    fn try_from(value: String) -> Result<Self, Error> {
        Self::parse(value)
    }
}

#[derive(Clone)]
pub struct SecretValue(pub(super) SecretString);

impl SecretValue {
    pub(crate) fn expose(&self) -> &str {
        use secrecy::ExposeSecret;
        self.0.expose_secret()
    }

    pub fn one_time(value: String) -> Result<Self, Error> {
        if !Self::valid_one_time(&value) {
            return Err(Error::InvalidValue);
        }
        Ok(Self(value.into()))
    }

    pub fn valid_one_time(text: &str) -> bool {
        (1..=MAX_VALUE_BYTES).contains(&text.len())
    }

    pub fn valid(text: &str) -> bool {
        (MIN_VALUE_BYTES..=MAX_VALUE_BYTES).contains(&trim_newline(text).len())
    }

    pub fn from_text(value: String) -> Result<Self, Error> {
        Self::parse(value.into())
    }

    pub fn parse(value: SecretString) -> Result<Self, Error> {
        use secrecy::ExposeSecret;
        let text = value.expose_secret();
        let trimmed = trim_newline(text);
        if !Self::valid(text) {
            return Err(Error::InvalidValue);
        }
        if text.len() == trimmed.len() {
            return Ok(Self(value));
        }
        Ok(Self(trimmed.to_owned().into()))
    }
}

fn trim_newline(text: &str) -> &str {
    text.strip_suffix("\r\n")
        .or_else(|| text.strip_suffix('\n'))
        .unwrap_or(text)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub scope: Scope,
    pub name: SecretName,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub delete_failed: bool,
}

impl Entry {
    pub(super) fn account(&self) -> String {
        format!("{}/{}", self.scope, self.id)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Saved,
    Cancelled,
    Exists,
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidName,
    InvalidValue,
    Unavailable,
    Missing,
    Exists,
    Index,
    Rollback,
}

impl std::fmt::Display for Error {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::InvalidName => "Use 1–64 uppercase letters, digits or underscores, starting with a letter or underscore.",
            Self::InvalidValue => "Secret must be 8–1024 bytes.",
            Self::Unavailable => "OS secret store unavailable.",
            Self::Missing => "Secret no longer exists.",
            Self::Exists => "Secret already exists. Use Replace in Settings.",
            Self::Index => "Could not read or update secret metadata.",
            Self::Rollback => "Could not roll back the OS store write after a metadata failure.",
        })
    }
}

impl std::error::Error for Error {}
