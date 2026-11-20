use super::{Database, Event, Transcript, locked};
use molfar_core::{
    secrets::{Redactor, Scope, SecretStore, redact::StreamRedactor},
    tool::tasks::Panel,
};

pub(crate) struct SecretOutput {
    redactor: Redactor,
    text: StreamRedactor,
    reasoning: StreamRedactor,
}

impl SecretOutput {
    pub(crate) fn open_path(
        database: &Database,
        project: &str,
        store: &SecretStore,
    ) -> Result<Self, String> {
        Self::open_session(database, project, store, None)
    }

    pub(crate) fn open_session(
        database: &Database,
        project: &str,
        store: &SecretStore,
        familiar: Option<&str>,
    ) -> Result<Self, String> {
        let db = locked(database)?;
        if let Some(familiar) = familiar {
            let redactor = store
                .redactor(&db, Some(Scope::Familiar(familiar.to_owned())))
                .map_err(|error| error.to_string())?;
            return Ok(Self::new(redactor));
        }

        let path = std::path::Path::new(project);
        let scope = match store.project_scope(&db, path, None) {
            Ok(scope) => Ok(scope),
            Err(molfar_core::secrets::Error::Missing) => {
                store.project_scope(&db, path, Some(project))
            }
            Err(error) => Err(error),
        }
        .map_err(|error| error.to_string())?;
        let redactor = store
            .redactor(&db, Some(scope))
            .map_err(|error| error.to_string())?;
        Ok(Self::new(redactor))
    }

    fn new(redactor: Redactor) -> Self {
        Self {
            redactor,
            text: StreamRedactor::default(),
            reasoning: StreamRedactor::default(),
        }
    }

    pub(crate) fn batch(&mut self, events: Vec<Event>) -> Vec<Event> {
        let mut output = Vec::with_capacity(events.len());
        for mut event in events {
            match &mut event {
                Event::BeginAssistant
                | Event::Done
                | Event::Interjection { .. }
                | Event::FollowUp(_) => {
                    output.extend(self.flush());
                }
                _ => {}
            }
            let redact = &self.redactor;
            match &mut event {
                Event::Text(text) => {
                    *text = self.text.push(redact, text);
                    if text.is_empty() {
                        continue;
                    }
                }
                Event::Reasoning(reasoning) => {
                    *reasoning = self.reasoning.push(redact, reasoning);
                    if reasoning.is_empty() {
                        continue;
                    }
                }
                Event::Tool(tool) => {
                    redact.scrub(&mut tool.id);
                    redact.scrub(&mut tool.name);
                    self.scrub_tool_input(&mut tool.input);
                    redact.scrub(&mut tool.output);
                    if let Some(display) = &mut tool.display {
                        redact.json(display);
                    }
                    self.scrub_panel(&mut tool.panel);
                }
                Event::Approval(approval) => {
                    redact.scrub(&mut approval.title);
                    redact.scrub(&mut approval.detail);
                }
                Event::Question(question) => {
                    redact.scrub(&mut question.title);
                    for item in &mut question.items {
                        redact.scrub(&mut item.prompt);
                        for option in &mut item.options {
                            redact.scrub(&mut option.label);
                            redact.scrub(&mut option.description);
                        }
                    }
                }
                Event::Commands(commands) => {
                    for command in commands {
                        redact.scrub(&mut command.name);
                        redact.scrub(&mut command.description);
                        redact.scrub(&mut command.invocation);
                        for text in command
                            .origin
                            .iter_mut()
                            .chain(command.input_hint.iter_mut())
                            .chain(command.aliases.iter_mut())
                        {
                            redact.scrub(text);
                        }
                        for subcommand in &mut command.subcommands {
                            for text in std::iter::once(&mut subcommand.name)
                                .chain(subcommand.description.iter_mut())
                                .chain(subcommand.usage.iter_mut())
                            {
                                redact.scrub(text);
                            }
                        }
                    }
                }
                Event::Background(tasks) => {
                    for task in tasks {
                        redact.scrub(&mut task.id);
                        redact.scrub(&mut task.description);
                        if let Some(command) = &mut task.command {
                            redact.scrub(command);
                        }
                    }
                }
                Event::ConfigChanged {
                    model,
                    model_settings,
                } => {
                    for value in model.iter_mut().chain(model_settings.values_mut()) {
                        redact.scrub(value);
                    }
                }
                Event::Interjection {
                    text,
                    custom_type,
                    severity,
                } => {
                    for value in [text, custom_type].into_iter().chain(severity.iter_mut()) {
                        redact.scrub(value);
                    }
                }
                Event::FollowUpFailed { error, .. }
                | Event::Status(error)
                | Event::Model(error) => redact.scrub(error),
                Event::FollowUp(_)
                | Event::Ready
                | Event::SessionId(_)
                | Event::TurnId(_)
                | Event::Context { .. }
                | Event::Metrics(_)
                | Event::Usage { .. }
                | Event::ApprovalResolved(_)
                | Event::QuestionResolved(_)
                | Event::BeginAssistant
                | Event::UsageLimited(_)
                | Event::Done => {}
            }
            output.push(event);
        }
        output
    }

    pub(crate) fn scrub(&self, text: &mut String) {
        self.redactor.scrub(text);
    }

    pub(crate) fn finish(&mut self, transcript: &mut Transcript) -> Option<usize> {
        let mut changed = None;
        for event in self.flush() {
            let (role, text) = match event {
                Event::Text(text) => ("assistant", text),
                Event::Reasoning(text) => ("reasoning", text),
                _ => unreachable!(),
            };
            if transcript.rows.last().is_none_or(|row| row.role != role) {
                transcript.begin(role);
            }
            let index = transcript.append(&text);
            changed = changed.or(Some(index));
        }
        changed
    }

    pub(crate) fn flush(&mut self) -> impl Iterator<Item = Event> {
        let reasoning = self.reasoning.finish(&self.redactor);
        let text = self.text.finish(&self.redactor);
        [
            (!reasoning.is_empty()).then_some(Event::Reasoning(reasoning)),
            (!text.is_empty()).then_some(Event::Text(text)),
        ]
        .into_iter()
        .flatten()
    }

    fn scrub_tool_input(&self, input: &mut String) {
        let original = input.clone();
        self.redactor.scrub(input);
        if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&original) {
            let before = value.clone();
            self.redactor.json(&mut value);
            if value != before {
                *input = value.to_string();
            }
        }
    }

    fn scrub_panel(&self, panel: &mut Option<Panel>) {
        match panel {
            Some(Panel::Tasks(tasks)) => {
                self.scrub(&mut tasks.explanation);
                for item in &mut tasks.items {
                    self.scrub(&mut item.text);
                    item.id.iter_mut().for_each(|id| self.scrub(id));
                }
            }
            Some(Panel::Agent(agent)) => {
                for text in std::iter::once(&mut agent.brief)
                    .chain(agent.name.iter_mut())
                    .chain(agent.model.iter_mut())
                    .chain(agent.agent_type.iter_mut())
                    .chain(agent.ids.iter_mut())
                {
                    self.scrub(text);
                }
                for step in &mut agent.steps {
                    for text in [
                        &mut step.id,
                        &mut step.kind,
                        &mut step.text,
                        &mut step.detail,
                    ]
                    .into_iter()
                    .chain(step.tool_kind.iter_mut())
                    {
                        self.scrub(text);
                    }
                    for value in step.preview.iter_mut().chain(step.display.iter_mut()) {
                        self.redactor.json(value);
                    }
                }
            }
            None => {}
        }
    }
}
