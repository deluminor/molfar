use secrecy::ExposeSecret;

use super::{Error, SecretValue, SERVICE};

pub(super) trait Backend: Send + Sync {
    fn probe(&self) -> Result<(), Error>;
    fn set(&self, account: &str, value: &SecretValue) -> Result<(), Error>;
    fn get(&self, account: &str) -> Result<SecretValue, Error>;
    fn delete(&self, account: &str) -> Result<(), Error>;
}

pub(super) struct KeyringBackend;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn map_error(error: keyring::Error) -> Error {
    match error {
        keyring::Error::NoEntry => Error::Missing,
        _ => Error::Unavailable,
    }
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn entry(account: &str) -> Result<keyring::Entry, Error> {
    #[cfg(target_os = "linux")]
    return keyring::secret_service::SsCredential::new_with_target(None, SERVICE, account)
        .map(|credential| keyring::Entry::new_with_credential(Box::new(credential)))
        .map_err(map_error);

    #[cfg(not(target_os = "linux"))]
    keyring::Entry::new(SERVICE, account).map_err(map_error)
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
impl Backend for KeyringBackend {
    fn probe(&self) -> Result<(), Error> {
        #[cfg(target_os = "linux")]
        {
            use dbus_secret_service::{EncryptionType, SecretService};
            let service =
                SecretService::connect(EncryptionType::Dh).map_err(|_| Error::Unavailable)?;
            let collection = service
                .get_default_collection()
                .map_err(|_| Error::Unavailable)?;
            if collection.is_locked().map_err(|_| Error::Unavailable)? {
                return Err(Error::Unavailable);
            }
            Ok(())
        }

        #[cfg(not(target_os = "linux"))]
        match entry("availability")?.get_secret() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(map_error(error)),
        }
    }

    fn set(&self, account: &str, value: &SecretValue) -> Result<(), Error> {
        self.probe()?;
        entry(account)?
            .set_password(value.0.expose_secret())
            .map_err(map_error)
    }

    fn get(&self, account: &str) -> Result<SecretValue, Error> {
        self.probe()?;
        entry(account)?
            .get_password()
            .map(|value| SecretValue(value.into()))
            .map_err(map_error)
    }

    fn delete(&self, account: &str) -> Result<(), Error> {
        self.probe()?;
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(map_error(error)),
        }
    }
}

#[cfg(any(test, feature = "test-secrets"))]
#[derive(Default)]
pub(super) struct MemoryBackend(
    std::sync::Mutex<std::collections::HashMap<String, secrecy::SecretString>>,
);

#[cfg(any(test, feature = "test-secrets"))]
impl Backend for MemoryBackend {
    fn probe(&self) -> Result<(), Error> {
        Ok(())
    }

    fn set(&self, account: &str, value: &SecretValue) -> Result<(), Error> {
        self.0
            .lock()
            .unwrap()
            .insert(account.to_owned(), value.0.clone());
        Ok(())
    }

    fn get(&self, account: &str) -> Result<SecretValue, Error> {
        self.0
            .lock()
            .unwrap()
            .get(account)
            .cloned()
            .map(SecretValue)
            .ok_or(Error::Missing)
    }

    fn delete(&self, account: &str) -> Result<(), Error> {
        self.0.lock().unwrap().remove(account);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_locked_keyring_to_unavailable() {
        let builder = keyring::mock::default_credential_builder();
        let credential = builder.build(None, SERVICE, "fixture").unwrap();
        credential
            .as_any()
            .downcast_ref::<keyring::mock::MockCredential>()
            .unwrap()
            .set_error(keyring::Error::NoStorageAccess(
                "fixture denied access".into(),
            ));

        let entry = keyring::Entry::new_with_credential(credential);
        assert_eq!(
            entry.get_password().map_err(map_error),
            Err(Error::Unavailable)
        );
    }
}
