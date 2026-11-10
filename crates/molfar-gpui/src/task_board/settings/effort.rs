use super::{super::Board, Panel};
use crate::theme::*;
use gpui::{App, Context, Div, Role, SharedString, div, prelude::*, px};
use molfar_core::{
    accounts::Profile,
    catalog::Model,
    provider::Kind,
    store::native_model,
    task_board::stage::{
        agent::AgentStage,
        choice::settings::{COLUMNS, EFFORT, HARNESS, MODEL, SettingsPatch},
    },
};
use serde_json::Value;

const DEFAULT_EFFORT: &str = "Default";

fn column_kind(column: &Value) -> Option<Kind> {
    column[HARNESS].as_str().and_then(Kind::parse)
}

impl Panel {
    /// Effort levels of the column's model, with a saved level kept even before
    /// the catalog arrives so the current choice is never hidden.
    fn efforts(&self, column: &Value) -> Vec<(String, String)> {
        let saved = column[EFFORT].as_str();
        let mut efforts = column_kind(column)
            .zip(column[MODEL].as_str())
            .and_then(|(kind, model)| {
                let model = native_model(model, kind.id())?;
                let models = self.models.iter().find(|(entry, _)| *entry == kind)?;
                let entry = models.1.iter().find(|entry| entry.id == model)?;
                Some(molfar_core::app_access::effort_choices(kind, entry))
            })
            .unwrap_or_default();
        if let Some(saved) = saved
            && !efforts.iter().any(|(value, _)| value == saved)
        {
            efforts.push((saved.to_owned(), saved.to_owned()));
        }
        efforts
    }
}

impl Board {
    pub(in crate::task_board) fn account(&self, kind: Kind, cx: &App) -> Profile {
        crate::accounts::get(cx)
            .map(|accounts| accounts.read(cx).selected(kind, &self.cwd))
            .unwrap_or_default()
    }

    /// Loads the catalogs of every provider a column uses, so effort levels show.
    pub(super) fn load_column_catalogs(&mut self, cx: &mut Context<Self>) {
        let Some(panel) = &self.settings else {
            return;
        };
        let mut kinds: Vec<Kind> = panel
            .saved
            .as_ref()
            .and_then(|saved| saved[COLUMNS].as_object())
            .map(|columns| columns.values().filter_map(column_kind).collect())
            .unwrap_or_default();
        kinds.sort_by_key(|kind| kind.id());
        kinds.dedup();
        kinds.retain(|kind| !panel.models.iter().any(|(entry, _)| entry == kind));

        for kind in kinds {
            let profile = self.account(kind, cx);
            if let Some(models) = molfar_core::catalog::cached_models_for(kind, &profile) {
                self.finish_catalog(kind, Ok(models), cx);
                continue;
            }
            if cfg!(test) {
                continue;
            }
            let work = cx
                .background_executor()
                .spawn(async move { molfar_core::catalog::models_for(kind, &profile) });
            cx.spawn(async move |this, cx| {
                let result = work.await;
                let _ = this.update(cx, |this, cx| this.finish_catalog(kind, result, cx));
            })
            .detach();
        }
    }

    fn finish_catalog(
        &mut self,
        kind: Kind,
        result: Result<Vec<Model>, String>,
        cx: &mut Context<Self>,
    ) {
        let Some(panel) = &mut self.settings else {
            return;
        };
        let models = match result {
            Ok(models) => models,
            Err(error) => {
                log::warn!("Board effort levels unavailable for {}: {error}", kind.id());
                return;
            }
        };
        panel.models.retain(|(entry, _)| *entry != kind);
        panel.models.push((kind, models));
        cx.notify();
    }

    pub(in crate::task_board) fn set_stage_effort(
        &mut self,
        stage: AgentStage,
        effort: Option<String>,
        cx: &mut Context<Self>,
    ) {
        if self
            .settings
            .as_ref()
            .and_then(|panel| panel.column(stage))
            .is_none()
        {
            return;
        }
        self.emit_settings(SettingsPatch::ColumnEffort(stage, effort), cx);
    }

    /// Default plus the model's effort levels; `None` when the model has none.
    pub(super) fn effort_options(
        &self,
        panel: &Panel,
        stage: AgentStage,
        prefix: &'static str,
        cx: &mut Context<Self>,
    ) -> Option<Div> {
        let column = panel.column(stage)?;
        let efforts = panel.efforts(column);
        if efforts.is_empty() {
            return None;
        }
        let current = column[EFFORT].as_str().map(str::to_owned);
        let options = std::iter::once((None, DEFAULT_EFFORT.to_owned()))
            .chain(efforts.into_iter().map(|(value, name)| (Some(value), name)));

        let mut row = div()
            .flex()
            .flex_wrap()
            .p(px(2.))
            .gap(px(2.))
            .rounded_lg()
            .bg(content(0.05));
        for (value, name) in options {
            let selected = value == current;
            let key = value.clone().unwrap_or_default();
            let selector = format!("{prefix}-{}-effort-{key}", stage.id());
            row = row.child(
                div()
                    .id(SharedString::from(selector.clone()))
                    .debug_selector(move || selector.clone())
                    .h(px(24.))
                    .px_2()
                    .flex()
                    .items_center()
                    .justify_center()
                    .rounded_md()
                    .text_size(px(11.))
                    .whitespace_nowrap()
                    .cursor_pointer()
                    .text_color(content(0.6))
                    .hover(|style| style.text_color(content(1.)))
                    .role(Role::Button)
                    .aria_label(format!("{name} effort"))
                    .aria_selected(selected)
                    .when(selected, |button| {
                        button
                            .bg(content(0.1))
                            .text_color(content(1.))
                            .font_weight(gpui::FontWeight::MEDIUM)
                    })
                    .child(name)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if !selected {
                            this.set_stage_effort(stage, value.clone(), cx);
                        }
                    })),
            );
        }
        Some(row)
    }
}
