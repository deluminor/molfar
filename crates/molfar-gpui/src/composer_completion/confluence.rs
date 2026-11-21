use std::time::Duration;

use gpui::Context;
use molfar_core::{
    composer::{self, Trigger},
    confluence::{config, resolve::PREFIX, search::Scope},
};

use super::{Choice, Completion};
use crate::{confluence::service::Service, runtime::locked};

impl Completion {
    pub(super) fn confluence_query(&self) -> Option<&str> {
        let token = self.token.as_ref()?;
        if token.trigger != Trigger::Mention {
            return None;
        }
        let query = token.query.strip_prefix(PREFIX)?;
        if query.len() > 500 || query.contains('/') {
            return None;
        }
        Some(query)
    }

    pub(super) fn load_confluence(&mut self, query: String, cx: &mut Context<Self>) {
        self.confluence.clear();
        let Some(database) = self.store.clone() else {
            return;
        };
        let generation = self.generation;
        let service = Service {
            database,
            secrets: Default::default(),
        };
        let timer = cx.background_executor().timer(Duration::from_millis(180));
        let executor = cx.background_executor().clone();
        cx.spawn(async move |view, cx| {
            timer.await;
            if !view
                .update(cx, |view, _| {
                    view.generation == generation && view.confluence_query() == Some(query.as_str())
                })
                .unwrap_or(false)
            {
                return;
            }
            let term = query.clone();
            let result = executor
                .spawn(async move {
                    let Some(connector) = service.open()? else {
                        return Ok(Vec::new());
                    };
                    let hidden = config::hidden_spaces(&*locked(&service.database)?)?;
                    connector
                        .search(&term, None, &hidden, 25, Scope::Title)
                        .map_err(|error| error.to_string())
                })
                .await;
            let _ = view.update(cx, |view, cx| {
                if view.generation == generation && view.confluence_query() == Some(query.as_str())
                {
                    match result {
                        Ok(nodes) => view.confluence = nodes,
                        Err(error) => log::debug!("Confluence completion: {error}"),
                    }
                    view.rank();
                    cx.notify();
                }
            });
        })
        .detach();
    }

    pub(super) fn confluence_choices(&self, query: &str) -> Vec<Choice> {
        let mut nodes: Vec<_> = self
            .confluence
            .iter()
            .filter_map(|node| composer::score(query, &node.title).map(|score| (score, node)))
            .collect();
        nodes.sort_by(|(a, first), (b, second)| {
            b.cmp(a).then_with(|| first.title.cmp(&second.title))
        });
        nodes
            .into_iter()
            .take(8)
            .map(|(_, node)| Choice {
                label: node.title.clone(),
                detail: node.space_key.clone(),
                insertion: format!("@confluence/page/{}", node.id),
                builtin: None,
                mode: None,
                file: false,
                server: None,
            })
            .collect()
    }
}
