use super::super::{constants::MAX_CLIENT_NAME, types::Client};

fn available(name: &str, clients: &[Client], except: Option<&str>) -> bool {
    let folded = name.to_lowercase();
    clients.iter().all(|client| {
        client.revoked_at.is_some()
            || except == Some(client.id.as_str())
            || client.name.to_lowercase() != folded
    })
}

pub fn default_name(clients: &[Client]) -> String {
    (1..=clients.len() + 1)
        .map(|index| format!("Client {index}"))
        .find(|name| available(name, clients, None))
        .expect("one more default name than clients")
}

pub(super) fn validate_name<'a>(
    name: &'a str,
    clients: &[Client],
    except: Option<&str>,
) -> Result<&'a str, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > MAX_CLIENT_NAME {
        return Err(format!(
            "Name the client in 1–{MAX_CLIENT_NAME} characters."
        ));
    }
    if !available(name, clients, except) {
        return Err("A client already uses that name.".into());
    }

    Ok(name)
}
