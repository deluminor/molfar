use molfar_core::{
    confluence::{config, connector::Connector},
    secrets::SecretStore,
};

use crate::runtime::{Database, locked};

#[derive(Clone)]
pub(crate) struct Service {
    pub database: Database,
    pub secrets: SecretStore,
}

impl Service {
    pub fn open(&self) -> Result<Option<Connector>, String> {
        let store = locked(&self.database)?;
        config::migrate(&store, &self.secrets)?;
        if config::load(&store)?.is_none() {
            return Ok(None);
        }
        Connector::open(&store, &self.secrets).map(Some)
    }

    pub fn connector(&self) -> Result<Connector, String> {
        self.open()?
            .ok_or_else(|| "Connect Confluence in Settings.".into())
    }
}

pub(crate) fn apply_context(database: &Database, secrets: &SecretStore, prompt: &str) -> String {
    use molfar_core::confluence::resolve;

    if !prompt.contains("@confluence/") && !prompt.contains("molfar://confluence/") {
        return prompt.to_owned();
    }

    let mut connector = None;
    resolve::apply(prompt, |mention| {
        let connector = connector.get_or_insert_with(|| {
            Service {
                database: database.clone(),
                secrets: secrets.clone(),
            }
            .connector()
        });
        let client = connector.as_ref().map_err(Clone::clone)?;
        client.resolve_mention(mention).map_err(|error| {
            log::warn!(
                "Confluence context {} {}: {}",
                mention.kind.label(),
                mention.id,
                error.kind()
            );
            error.to_string()
        })
    })
}
