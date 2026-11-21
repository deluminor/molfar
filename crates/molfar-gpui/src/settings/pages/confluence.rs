use gpui::{AnyElement, Context, Entity, FontWeight, div, prelude::*, px};
use molfar_core::{
    confluence::config::{self, Connection},
    secrets::SecretValue,
};

use crate::{
    confluence::service::Service,
    input::Input,
    runtime::locked,
    settings::{
        SettingsEvent, SettingsView,
        widgets::{red, secondary_button},
    },
    theme::*,
};

#[derive(Default)]
pub(in crate::settings) struct ConfluenceSettings {
    fields: Option<Fields>,
    connection: Option<Connection>,
    busy: bool,
    loaded: bool,
    message: Option<(bool, String)>,
}

#[derive(Clone)]
struct Fields {
    site: Entity<Input>,
    email: Entity<Input>,
    token: Entity<Input>,
}

enum Operation {
    Load,
    Connect(Connection, SecretValue),
    Disconnect,
    Test,
}

impl SettingsView {
    pub(super) fn confluence_card(&mut self, cx: &mut Context<Self>) -> AnyElement {
        if self.confluence.fields.is_none() {
            let field = |label, placeholder, cx: &mut Context<Self>| {
                cx.new(|cx| Input::field(label, placeholder, content(0.45), cx))
            };
            self.confluence.fields = Some(Fields {
                site: field("Confluence site", "yourteam.atlassian.net", cx),
                email: field("Confluence email", "Email", cx),
                token: cx.new(Input::secret_field),
            });
        }
        if !self.confluence.loaded && !self.confluence.busy && self.secret_database.is_some() {
            self.confluence.loaded = true;
            self.confluence_operation(Operation::Load, cx);
        }
        let fields = self.confluence.fields.as_ref().expect("fields initialized");
        let busy = self.confluence.busy;
        let connected = self.confluence.connection.is_some();
        div()
            .id("confluence-connection")
            .debug_selector(|| "confluence-connection".into())
            .rounded_lg()
            .border_1()
            .border_color(content(0.08))
            .p_4()
            .flex()
            .flex_col()
            .gap_3()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .text_size(px(14.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(icon("book-open", 15.))
                    .child("Confluence Cloud"),
            )
            .when_some(self.confluence.connection.as_ref(), |card, connection| {
                card.child(
                    div()
                        .text_size(px(12.))
                        .text_color(content(0.62))
                        .child(format!("{} · {}", connection.site, connection.email)),
                )
            })
            .when(!connected, |card| {
                card.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(input_shell(fields.site.clone()))
                        .child(input_shell(fields.email.clone()))
                        .child(input_shell(fields.token.clone())),
                )
            })
            .when_some(
                self.confluence.message.as_ref(),
                |card, (error, message)| {
                    card.child(
                        div()
                            .debug_selector(|| "confluence-settings-result".into())
                            .text_size(px(12.))
                            .text_color(if *error { red(0.95) } else { content(0.65) })
                            .child(message.clone()),
                    )
                },
            )
            .child(
                div()
                    .flex()
                    .gap_2()
                    .when(busy, |buttons| {
                        buttons.child(crate::right_panel::spinner(
                            "confluence-connection-busy",
                            "refresh-cw",
                            14.,
                        ))
                    })
                    .when(!connected, |buttons| {
                        buttons.child(
                            secondary_button("confluence-save", "Connect", false, busy)
                                .child("Connect")
                                .when(!busy, |button| {
                                    button.on_click(
                                        cx.listener(|this, _, _, cx| this.save_confluence(cx)),
                                    )
                                }),
                        )
                    })
                    .when(connected, |buttons| {
                        buttons
                            .child(
                                secondary_button("confluence-test", "Test connection", false, busy)
                                    .child("Test connection")
                                    .when(!busy, |button| {
                                        button.on_click(cx.listener(|this, _, _, cx| {
                                            this.confluence_operation(Operation::Test, cx)
                                        }))
                                    }),
                            )
                            .child(
                                secondary_button("confluence-disconnect", "Disconnect", true, busy)
                                    .child("Disconnect")
                                    .when(!busy, |button| {
                                        button.on_click(cx.listener(|this, _, _, cx| {
                                            this.confluence_operation(Operation::Disconnect, cx)
                                        }))
                                    }),
                            )
                    }),
            )
            .into_any_element()
    }

    fn save_confluence(&mut self, cx: &mut Context<Self>) {
        let Some(fields) = &self.confluence.fields else {
            return;
        };
        let result = Connection::parse(
            &fields.site.read(cx).content,
            &fields.email.read(cx).content,
        )
        .and_then(|connection| {
            let token = fields
                .token
                .read(cx)
                .secret_value()
                .map_err(|_| "API token must be 8 to 1024 bytes.")?;
            Ok((connection, token))
        });
        match result {
            Ok((connection, token)) => {
                self.confluence_operation(Operation::Connect(connection, token), cx)
            }
            Err(error) => {
                self.confluence.message = Some((true, error));
                cx.notify();
            }
        }
    }

    fn confluence_operation(&mut self, operation: Operation, cx: &mut Context<Self>) {
        if self.confluence.busy {
            return;
        }
        let Some((database, secrets)) = self.secret_database.clone() else {
            return;
        };
        let service = Service { database, secrets };
        let changed = matches!(operation, Operation::Connect(..) | Operation::Disconnect);
        self.confluence.message = None;
        self.confluence.busy = true;
        let job = cx.background_executor().spawn(async move {
            if matches!(operation, Operation::Test) {
                service
                    .connector()?
                    .test_connection()
                    .map_err(|error| error.to_string())?;
                let connection = config::load(&*locked(&service.database)?)?;
                return Ok((connection, Some("Connection verified.")));
            }
            let store = locked(&service.database)?;
            match operation {
                Operation::Load => config::migrate(&store, &service.secrets)?,
                Operation::Connect(connection, token) => {
                    config::connect(&store, &service.secrets, &connection, token)?
                }
                Operation::Disconnect => config::disconnect(&store, &service.secrets)?,
                Operation::Test => {}
            }
            Ok::<_, String>((config::load(&store)?, None))
        });

        cx.spawn(async move |view, cx| {
            let result = job.await;
            let _ = view.update(cx, |this, cx| {
                this.confluence.busy = false;
                match result {
                    Ok((connection, message)) => {
                        this.confluence.connection = connection;
                        this.confluence.message = message.map(|text| (false, text.into()));
                        if changed {
                            if let Some(fields) = &this.confluence.fields {
                                fields.token.update(cx, |input, cx| input.clear_secret(cx));
                            }
                            this.refresh_secrets(cx);
                            cx.emit(SettingsEvent::ConfluenceChanged);
                        }
                    }
                    Err(error) => {
                        log::warn!("Confluence connection: {error}");
                        this.confluence.message = Some((true, error));
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}

fn input_shell(input: Entity<Input>) -> gpui::Div {
    div()
        .rounded_md()
        .border_1()
        .border_color(content(0.1))
        .px_2()
        .py_1()
        .child(input)
}
