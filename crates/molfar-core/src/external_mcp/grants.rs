use super::{
    constants::{CLIENTS_KEY, CONFIG_KEY, MAX_CLIENTS, MAX_CLIENT_NAME, TOKEN_PREFIX},
    types::{Client, Principal, ServerConfig, SCOPE},
};
use crate::store::Store;
use rand::RngCore;
use sha2::{Digest, Sha256};

impl Store {
    pub fn external_config(&self) -> Result<ServerConfig, String> {
        self.setting(CONFIG_KEY)?
            .map(|raw| serde_json::from_str(&raw).map_err(|error| error.to_string()))
            .transpose()
            .map(Option::unwrap_or_default)
    }

    pub fn save_external_config(&self, config: &ServerConfig) -> Result<(), String> {
        if config.port < 1024 {
            return Err("Choose a port from 1024 to 65535.".into());
        }
        let raw = serde_json::to_string(config).map_err(|error| error.to_string())?;
        self.save_setting(CONFIG_KEY, &raw)
    }

    pub fn external_clients(&self) -> Result<Vec<Client>, String> {
        self.setting(CLIENTS_KEY)?
            .map(|raw| serde_json::from_str(&raw).map_err(|error| error.to_string()))
            .transpose()
            .map(Option::unwrap_or_default)
    }

    /// Returns the credential once; only its verifier is stored.
    pub fn external_create_client(
        &self,
        name: &str,
        scopes: &[SCOPE],
        projects: &[String],
    ) -> Result<(Client, String), String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > MAX_CLIENT_NAME {
            return Err(format!(
                "Name the client in up to {MAX_CLIENT_NAME} characters."
            ));
        }
        let mut clients = self.external_clients()?;
        if clients
            .iter()
            .filter(|client| client.revoked_at.is_none())
            .count()
            >= MAX_CLIENTS
        {
            return Err("Revoke an unused client before adding another.".into());
        }

        let id = uuid::Uuid::new_v4().simple().to_string();
        let mut secret = [0_u8; 32];
        rand::rng().fill_bytes(&mut secret);
        let secret: String = secret.iter().map(|byte| format!("{byte:02x}")).collect();
        let token = format!("{TOKEN_PREFIX}_{id}_{secret}");
        let client = Client {
            id,
            name: name.into(),
            verifier: verifier(&token),
            scopes: unique(scopes),
            projects: projects.to_vec(),
            created_at: now(),
            revoked_at: None,
        };
        clients.push(client.clone());
        self.save_clients(&clients)?;
        Ok((client, token))
    }

    pub fn external_update_client(
        &self,
        id: &str,
        scopes: &[SCOPE],
        projects: &[String],
    ) -> Result<Client, String> {
        let mut clients = self.external_clients()?;
        let client = clients
            .iter_mut()
            .find(|client| client.id == id && client.revoked_at.is_none())
            .ok_or("External client not found.")?;
        client.scopes = unique(scopes);
        client.projects = projects.to_vec();
        let updated = client.clone();
        self.save_clients(&clients)?;
        Ok(updated)
    }

    /// Revocation keeps the record, so its receipts can never be claimed by a
    /// later client with a reused ID.
    pub fn external_revoke_client(&self, id: &str) -> Result<(), String> {
        let mut clients = self.external_clients()?;
        let client = clients
            .iter_mut()
            .find(|client| client.id == id)
            .ok_or("External client not found.")?;
        client.revoked_at.get_or_insert_with(now);
        self.save_clients(&clients)
    }

    /// `None` for missing, malformed, unknown and revoked credentials alike.
    pub fn external_authenticate(&self, token: &str) -> Result<Option<Principal>, String> {
        let Some(id) = token
            .strip_prefix(TOKEN_PREFIX)
            .and_then(|rest| rest.strip_prefix('_'))
            .and_then(|rest| rest.split_once('_'))
            .map(|(id, _)| id)
        else {
            return Ok(None);
        };
        let presented = verifier(token);

        Ok(self
            .external_clients()?
            .into_iter()
            .find(|client| {
                client.id == id
                    && client.revoked_at.is_none()
                    && constant_time_eq(client.verifier.as_bytes(), presented.as_bytes())
            })
            .map(|client| Principal {
                client_id: client.id,
                name: client.name,
                scopes: client.scopes,
                projects: client.projects,
            }))
    }

    fn save_clients(&self, clients: &[Client]) -> Result<(), String> {
        let raw = serde_json::to_string(clients).map_err(|error| error.to_string())?;
        self.save_setting(CLIENTS_KEY, &raw)
    }
}

fn verifier(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
            == 0
}

fn unique(scopes: &[SCOPE]) -> Vec<SCOPE> {
    SCOPE::ALL
        .into_iter()
        .filter(|scope| scopes.contains(scope))
        .collect()
}

pub(crate) fn now() -> i64 {
    i64::try_from(crate::time::now_ms()).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests;
