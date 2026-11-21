use std::{fs, io, path::Path, sync::Mutex};

use serde::{Deserialize, Serialize};
use url::Url;

use super::{Client, Error};
use crate::secrets::{SecretStore, SecretValue};

static CONNECTION_LOCK: Mutex<()> = Mutex::new(());
const LEGACY_FILE: &str = "jira-config.json";

pub struct Credentials {
    site: String,
    email: String,
    token: String,
}

#[derive(Deserialize, Serialize)]
struct StoredCredentials<T> {
    site: T,
    email: T,
    token: T,
}

impl Credentials {
    pub fn new(site: &str, email: &str, token: &str) -> Result<Self, Error> {
        let email = email.trim();
        let token = token.trim();
        if !email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty() && !domain.is_empty() && !domain.contains('@')
        }) || email.contains([':', ' '])
            || email.chars().any(char::is_control)
        {
            return Err(Error::Invalid("Enter your Atlassian email address".into()));
        }
        if token.is_empty() {
            return Err(Error::Invalid("Enter an Atlassian API token".into()));
        }

        let credentials = Self {
            site: normalize_site(site)?,
            email: email.into(),
            token: token.into(),
        };
        credentials.secret()?;
        Ok(credentials)
    }

    pub fn site(&self) -> &str {
        &self.site
    }

    pub fn email(&self) -> &str {
        &self.email
    }

    pub(super) fn authorization(&self) -> String {
        format!("{}:{}", self.email, self.token)
    }

    fn secret(&self) -> Result<SecretValue, Error> {
        let json = serde_json::to_string(&StoredCredentials {
            site: &self.site,
            email: &self.email,
            token: &self.token,
        })
        .map_err(|_| Error::Invalid("Could not encode Atlassian credentials".into()))?;
        SecretValue::from_text(json)
            .map_err(|_| Error::Invalid("Atlassian credentials exceed 1024 bytes".into()))
    }

    fn parse(raw: &str) -> Result<Self, Error> {
        let stored: StoredCredentials<String> = serde_json::from_str(raw)
            .map_err(|_| Error::Invalid("Stored Atlassian credentials are invalid".into()))?;
        Self::new(&stored.site, &stored.email, &stored.token)
    }
}

fn normalize_site(raw: &str) -> Result<String, Error> {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err(Error::Invalid("Enter your Atlassian site".into()));
    }
    let input = if raw.contains("://") {
        raw.to_owned()
    } else if raw.contains('.') {
        format!("https://{raw}")
    } else {
        format!("https://{raw}.atlassian.net")
    };
    let url = Url::parse(&input).map_err(|_| Error::Invalid("Invalid Atlassian site".into()))?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err(Error::Invalid("Use an HTTPS site without user info".into()));
    }
    Ok(url.origin().ascii_serialization())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Connection {
    pub site: String,
    pub email: String,
    pub confluence: bool,
}

pub fn test_connection(app: &Path, credentials: Credentials) -> Result<Connection, Error> {
    let _lock = CONNECTION_LOCK.lock().map_err(storage_error)?;
    let client = Client::new(&credentials);
    let myself = client.get("/rest/api/3/myself")?;
    if myself["accountId"].as_str().is_none_or(str::is_empty) {
        return Err(Error::Invalid(
            "Jira did not return the current user".into(),
        ));
    }
    let confluence = match client.get("/wiki/rest/api/user/current") {
        Ok(_) => true,
        Err(Error::NotFound) => false,
        Err(error) => return Err(error),
    };

    SecretStore::default()
        .set_atlassian(Some(&credentials.secret()?))
        .map_err(storage_error)?;
    remove_legacy(app)?;
    Ok(Connection {
        site: credentials.site,
        email: credentials.email,
        confluence,
    })
}

pub fn load(app: &Path) -> Result<Option<Credentials>, Error> {
    let _lock = CONNECTION_LOCK.lock().map_err(storage_error)?;
    migrate(app, &SecretStore::default())
}

fn migrate(app: &Path, store: &SecretStore) -> Result<Option<Credentials>, Error> {
    if let Some(value) = store.atlassian().map_err(storage_error)? {
        let credentials = Credentials::parse(value.expose())?;
        remove_legacy(app)?;
        return Ok(Some(credentials));
    }

    let raw = match fs::read_to_string(app.join(LEGACY_FILE)) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(storage_error(error)),
    };
    let credentials = Credentials::parse(&raw)?;
    store
        .set_atlassian(Some(&credentials.secret()?))
        .map_err(storage_error)?;
    remove_legacy(app)?;
    Ok(Some(credentials))
}

pub fn disconnect(app: &Path) -> Result<(), Error> {
    let _lock = CONNECTION_LOCK.lock().map_err(storage_error)?;
    let site =
        migrate(app, &SecretStore::default())?.map(|credentials| credentials.site().to_string());
    remove_legacy(app)?;
    SecretStore::default()
        .set_atlassian(None)
        .map_err(storage_error)?;
    if let Some(site) = site.as_deref() {
        crate::jira::remove_site(app, site)?;
    }
    Ok(())
}

fn remove_legacy(app: &Path) -> Result<(), Error> {
    match fs::remove_file(app.join(LEGACY_FILE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(storage_error(error)),
    }
}

fn storage_error(error: impl std::fmt::Display) -> Error {
    Error::Offline(format!("Atlassian credential storage: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_sites_and_checks_secret_size_locally() {
        let credentials = Credentials::new("TEAM", "user@example.com", "fixture").unwrap();
        assert_eq!(credentials.site(), "https://team.atlassian.net");
        for site in [
            "http://team.atlassian.net",
            "https://user@team.atlassian.net",
        ] {
            assert!(matches!(
                Credentials::new(site, "user@example.com", "fixture"),
                Err(Error::Invalid(_))
            ));
        }
        assert!(matches!(
            Credentials::new("team", "user@example.com", &"x".repeat(1024)),
            Err(Error::Invalid(_))
        ));
    }

    #[test]
    fn imports_legacy_file_once_and_prefers_keyring() {
        let app = tempfile::tempdir().unwrap();
        let store = SecretStore::in_memory();
        let path = app.path().join(LEGACY_FILE);
        let fixture = |site| {
            serde_json::json!({"site": site, "email": "user@example.com", "token": "fixture"})
                .to_string()
        };

        fs::write(&path, fixture("team")).unwrap();
        assert_eq!(
            migrate(app.path(), &store).unwrap().unwrap().site(),
            "https://team.atlassian.net"
        );
        assert!(!path.exists());

        fs::write(&path, fixture("another")).unwrap();
        assert_eq!(
            migrate(app.path(), &store).unwrap().unwrap().site(),
            "https://team.atlassian.net"
        );
        assert!(!path.exists());
    }
}
