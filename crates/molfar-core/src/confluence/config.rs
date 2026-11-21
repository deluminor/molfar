use std::{collections::HashSet, fs, sync::Mutex};

use base64::{engine::general_purpose::STANDARD, Engine};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::{
    secrets::{Entry, Scope, SecretName, SecretStore, SecretValue, Status},
    store::Store,
};

use super::{
    cache::Cache,
    http::{Client, Http},
};

const CONNECTION: &str = "confluence.connection";
const HIDDEN_SPACES: &str = "confluence.hiddenSpaces";
const MIGRATED: &str = "confluence.migrated";
const TOKEN_NAME: &str = "CONFLUENCE_API_TOKEN";
static CONNECTION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Connection {
    pub site: String,
    pub email: String,
}

impl Connection {
    pub fn parse(site: &str, email: &str) -> Result<Self, String> {
        let site = normalize_site(site)?;
        let email = email.trim();
        if email.len() > 320
            || !email.contains('@')
            || email
                .chars()
                .any(|ch| ch.is_control() || ch.is_whitespace() || ch == ':')
        {
            return Err("Enter a valid Confluence email.".into());
        }

        Ok(Self {
            site,
            email: email.to_owned(),
        })
    }
}

pub fn load(db: &Store) -> Result<Option<Connection>, String> {
    db.setting(CONNECTION)?
        .filter(|value| !value.is_empty())
        .map(|value| {
            let connection: Connection =
                serde_json::from_str(&value).map_err(|_| "Confluence settings are invalid.")?;
            Connection::parse(&connection.site, &connection.email)
        })
        .transpose()
}

pub fn hidden_spaces(db: &Store) -> Result<HashSet<String>, String> {
    db.setting(HIDDEN_SPACES)?.map_or_else(
        || Ok(HashSet::new()),
        |value| {
            serde_json::from_str(&value).map_err(|_| "Confluence hidden spaces are invalid.".into())
        },
    )
}

pub fn set_hidden_spaces(db: &Store, hidden: &HashSet<String>) -> Result<(), String> {
    db.save_setting(
        HIDDEN_SPACES,
        &serde_json::to_string(hidden).map_err(|error| error.to_string())?,
    )
}

pub fn connect(
    db: &Store,
    secrets: &SecretStore,
    connection: &Connection,
    token: SecretValue,
) -> Result<(), String> {
    let _lock = CONNECTION_LOCK
        .lock()
        .map_err(|_| "Confluence settings are unavailable.")?;
    save_connection(db, secrets, connection, token)?;
    db.save_setting(MIGRATED, "true")
}

fn save_connection(
    db: &Store,
    secrets: &SecretStore,
    connection: &Connection,
    token: SecretValue,
) -> Result<(), String> {
    let connection = Connection::parse(&connection.site, &connection.email)?;
    let json =
        serde_json::to_string(&connection).map_err(|_| "Confluence settings are invalid.")?;

    if let Some(entry) = token_entry(db, secrets)? {
        let old = secrets
            .read_value(&entry)
            .map_err(|error| error.to_string())?;
        let old = SecretValue::parse(old).map_err(|error| error.to_string())?;
        secrets
            .replace(db, &entry.id, token)
            .map_err(|error| error.to_string())?;
        if let Err(error) = db.save_setting(CONNECTION, &json) {
            secrets
                .replace(db, &entry.id, old)
                .map_err(|_| "Confluence credential rollback failed.")?;
            return Err(error);
        }
    } else {
        let name = SecretName::parse(TOKEN_NAME.to_owned()).map_err(|error| error.to_string())?;
        let status = secrets
            .create(db, Scope::Global, name, token)
            .map_err(|error| error.to_string())?;
        if status != Status::Saved {
            return Err("Confluence credential already exists.".into());
        }

        if let Err(error) = db.save_setting(CONNECTION, &json) {
            if let Some(entry) = token_entry(db, secrets)? {
                secrets
                    .delete(db, &entry.id)
                    .map_err(|_| "Confluence credential rollback failed.")?;
            }
            return Err(error);
        }
    }

    Ok(())
}

pub fn disconnect(db: &Store, secrets: &SecretStore) -> Result<(), String> {
    let _lock = CONNECTION_LOCK
        .lock()
        .map_err(|_| "Confluence settings are unavailable.")?;
    db.save_setting(MIGRATED, "true")?;
    if let Some(entry) = token_entry(db, secrets)? {
        secrets
            .delete(db, &entry.id)
            .map_err(|error| error.to_string())?;
    }
    db.save_setting(CONNECTION, "")
}

pub fn client(db: &Store, secrets: &SecretStore) -> Result<(Client, Cache), String> {
    let _lock = CONNECTION_LOCK
        .lock()
        .map_err(|_| "Confluence settings are unavailable.")?;
    let connection = load(db)?.ok_or("Connect Confluence in Settings.")?;
    let entry = token_entry(db, secrets)?.ok_or("Connect Confluence in Settings.")?;
    let token = secrets
        .read_value(&entry)
        .map_err(|error| error.to_string())?;
    let url = Url::parse(&connection.site).map_err(|_| "Confluence site is invalid.")?;
    let authorization = format!(
        "Basic {}",
        STANDARD.encode(format!("{}:{}", connection.email, token.expose_secret()))
    )
    .into();
    let cache = Cache::new(
        db.data_dir(),
        &format!("{}:{}:{}", connection.site, entry.id, entry.updated_at),
    );

    Ok((Client::new(url, authorization, Http::default()), cache))
}

pub fn test_connection(db: &Store, secrets: &SecretStore) -> Result<(), String> {
    let (client, _) = client(db, secrets)?;
    client
        .request("/wiki/api/v2/spaces?limit=1")
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn token_entry(db: &Store, secrets: &SecretStore) -> Result<Option<Entry>, String> {
    Ok(secrets
        .list(db)
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|entry| entry.scope == Scope::Global && entry.name.as_str() == TOKEN_NAME))
}

pub fn migrate(db: &Store, secrets: &SecretStore) -> Result<(), String> {
    let _lock = CONNECTION_LOCK
        .lock()
        .map_err(|_| "Confluence settings are unavailable.")?;
    if db.setting(MIGRATED)?.as_deref() == Some("true") {
        return Ok(());
    }

    if load(db)?.is_none() {
        if let Some(directory) = db.data_dir() {
            match fs::read_to_string(directory.join("jira-config.json")) {
                Ok(raw) => migrate_config(db, secrets, &raw)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
                Err(_) => return Err("Could not read legacy Confluence settings.".into()),
            }
        }
    }

    db.save_setting(MIGRATED, "true")
}

fn migrate_config(db: &Store, secrets: &SecretStore, raw: &str) -> Result<(), String> {
    #[derive(Deserialize)]
    struct Legacy {
        site: String,
        email: String,
        token: String,
    }

    let legacy: Legacy =
        serde_json::from_str(raw).map_err(|_| "Legacy Confluence settings are invalid.")?;
    if legacy.token.trim().is_empty() {
        return Ok(());
    }

    let token = SecretValue::from_text(legacy.token.trim().to_owned())
        .map_err(|error| error.to_string())?;
    let connection = Connection::parse(&legacy.site, &legacy.email)?;
    save_connection(db, secrets, &connection, token)
}

pub fn normalize_site(raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err("Enter a Confluence site.".into());
    }

    let url = if raw.contains("://") {
        Url::parse(raw)
    } else if raw.contains('.') {
        Url::parse(&format!("https://{raw}"))
    } else {
        Url::parse(&format!("https://{raw}.atlassian.net"))
    }
    .map_err(|_| "Confluence site is invalid.")?;

    if url.scheme() != "https"
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Enter a valid HTTPS Confluence site.".into());
    }

    Ok(url.origin().ascii_serialization())
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
