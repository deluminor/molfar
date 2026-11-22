use std::path::PathBuf;

use gpui::{AnyElement, Context, prelude::*};
use molfar_core::atlassian::{self, Connection, Credentials};

use crate::{
    input::Input,
    runtime::locked,
    settings::{
        SettingsView,
        widgets::{note, secondary_button},
    },
    theme::content,
};

const SITE: &str = "Atlassian site";
const EMAIL: &str = "Atlassian email";
const TOKEN: &str = "Atlassian API token";
const WRITE_LABEL: &str = "Allow Operator sessions to write to Jira";
const WRITE_HELP: &str = "Operator sessions can comment, create, edit, and transition Jira issues. Read-only and plan threads never write.";

#[derive(Default)]
pub(in crate::settings) struct AtlassianState {
    busy: bool,
    status: String,
}

impl SettingsView {
    fn atlassian_directory(&self) -> PathBuf {
        self.secret_database
            .as_ref()
            .and_then(|(database, _)| locked(database).ok()?.data_dir().map(PathBuf::from))
            .unwrap_or_else(crate::data_dir)
    }

    fn run_atlassian(
        &mut self,
        operation: impl FnOnce(PathBuf) -> Result<Option<Connection>, atlassian::Error> + Send + 'static,
        cx: &mut Context<Self>,
    ) {
        self.atlassian.busy = true;
        self.atlassian.status = "Checking connection…".into();
        let directory = self.atlassian_directory();
        let task = cx
            .background_executor()
            .spawn(async move { operation(directory) });

        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.atlassian.busy = false;
                this.clear_connection_field(TOKEN, cx);
                match result {
                    Ok(connection) => {
                        this.atlassian.status = match &connection {
                            Some(status) if status.confluence => {
                                format!("{} · {} · Confluence responded", status.site, status.email)
                            }
                            Some(status) => format!("{} · {}", status.site, status.email),
                            None => "Disconnected".into(),
                        };
                        for (field, value) in [
                            (SITE, connection.as_ref().map(|status| status.site.clone())),
                            (
                                EMAIL,
                                connection.as_ref().map(|status| status.email.clone()),
                            ),
                        ] {
                            if let Some(value) = value {
                                this.fields[field]
                                    .update(cx, |input, cx| input.set_text(value, cx));
                            }
                        }
                    }
                    Err(error) => this.atlassian.status = error.to_string(),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn atlassian_group(&mut self, cx: &mut Context<Self>) -> AnyElement {
        if !self.fields.contains_key(SITE) {
            for (key, placeholder, secret) in [
                (SITE, "team.atlassian.net", false),
                (EMAIL, "you@example.com", false),
                (TOKEN, "Personal API token", true),
            ] {
                let input = cx.new(|cx| {
                    let mut input = Input::field(key, placeholder, content(0.35), cx);
                    input.set_font_size(13.);
                    input.set_secret(secret);
                    input
                });
                self.fields.insert(key, input);
            }
            self.run_atlassian(
                |directory| {
                    atlassian::load(&directory).map(|value| {
                        value.map(|credentials| Connection {
                            site: credentials.site().to_owned(),
                            email: credentials.email().to_owned(),
                            confluence: false,
                        })
                    })
                },
                cx,
            );
        }

        let busy = self.atlassian.busy;
        let operator = self.prefs.jira_operator_write;
        let write_toggle = self.toggle(
            "jira-operator-write",
            WRITE_LABEL,
            operator,
            false,
            cx,
            |this, on, cx| {
                this.update(cx, |preferences| preferences.jira_operator_write = on);
            },
        );
        let fields = [SITE, EMAIL, TOKEN]
            .map(|key| self.connection_field(key, key, busy, cx).into_any_element());
        let mut rows = Vec::from(fields);
        let controls = vec![
            secondary_button("atlassian-test", "Test connection", false, busy)
                .child("Test connection")
                .on_click(cx.listener(|this, _, _, cx| {
                    if this.atlassian.busy {
                        return;
                    }
                    let site = this.connection_value(SITE, cx);
                    let email = this.connection_value(EMAIL, cx);
                    let token = this.connection_value(TOKEN, cx);
                    this.run_atlassian(
                        move |directory| {
                            let credentials = if token.trim().is_empty() {
                                atlassian::load(&directory)?
                                    .filter(|credentials| {
                                        credentials.site() == site && credentials.email() == email
                                    })
                                    .ok_or_else(|| {
                                        atlassian::Error::Invalid(
                                            "Enter an Atlassian API token".into(),
                                        )
                                    })?
                            } else {
                                Credentials::new(&site, &email, &token)?
                            };
                            let result = atlassian::test_connection(&directory, credentials)?;
                            Ok(Some(result))
                        },
                        cx,
                    );
                }))
                .into_any_element(),
            secondary_button("atlassian-disconnect", "Disconnect", false, busy)
                .child("Disconnect")
                .on_click(cx.listener(|this, _, _, cx| {
                    if !this.atlassian.busy {
                        this.run_atlassian(
                            |directory| atlassian::disconnect(&directory).map(|()| None),
                            cx,
                        );
                    }
                }))
                .into_any_element(),
        ];
        rows.push(self.row(None, false, "Connection", None, controls));
        rows.push(note(self.atlassian.status.clone()));
        rows.push(self.row(
            None,
            false,
            WRITE_LABEL,
            Some(WRITE_HELP.into()),
            vec![write_toggle],
        ));
        self.group(
            Some("atlassian"),
            false,
            "Atlassian",
            Some("Shared connection for Jira and Confluence.".into()),
            None,
            rows,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn older_preferences_default_to_read_only_jira() {
        let preferences: crate::settings::Preferences = serde_json::from_str("{}").unwrap();
        assert!(!preferences.jira_operator_write);
        assert_eq!(
            WRITE_HELP,
            "Operator sessions can comment, create, edit, and transition Jira issues. Read-only and plan threads never write."
        );
    }
}
