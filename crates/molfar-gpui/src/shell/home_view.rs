use super::*;
use crate::home::{self, data::feeds::Sources};

impl Shell {
    pub(super) fn open_home(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.prepare_app_view(window, cx);
        self.ensure_background_inbox(window, cx);
        self.initialize_automations(cx);
        self.warm_host(window, cx);
        if let Some(view) = &self.home {
            view.update(cx, |view, cx| view.reveal(cx));
        }
        self.show_app_view(app_views::AppView::Home, window, cx);
    }

    /// Starts host sampling at launch, before Home is opened, and keeps the view alive.
    pub(crate) fn warm_host(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.home.is_none() {
            let stored = self.workspace.home_layout.clone();
            let view = cx.new(|cx| home::Home::new(&stored, cx));
            self.app_view_events.push(cx.subscribe_in(
                &view,
                window,
                |this, _, event: &home::Event, window, cx| this.home_event(event, window, cx),
            ));
            self.home = Some(view);
        }
        self.sync_home_sources(cx);
    }

    /// Hands Home what the shell already owns, once more of it becomes ready.
    pub(super) fn sync_home_sources(&mut self, cx: &mut Context<Self>) {
        let Some(view) = self.home.clone() else {
            return;
        };
        let sources = Sources {
            store: Some(self.store.clone()),
            automations: self.automation_state.service.clone(),
            inbox: self.inbox.clone(),
            project: self.workspace.project.clone(),
        };
        view.update(cx, |view, cx| view.set_sources(sources, cx));
    }

    fn home_event(&mut self, event: &home::Event, window: &mut Window, cx: &mut Context<Self>) {
        match event {
            home::Event::Close => self.close_app_view(window, cx),
            home::Event::Layout(layout) => {
                self.workspace.home_layout = layout.clone();
                self.persist(cx);
            }
            home::Event::OpenSession(id) => self.open(*id, window, cx),
            home::Event::OpenAutomation(id) => {
                self.open_automations(window, cx);
                if !id.is_empty()
                    && let Some(view) = &self.automations
                {
                    let id = id.clone();
                    view.update(cx, |view, cx| view.open_automation(id, cx));
                }
            }
            home::Event::OpenInbox(key) => {
                self.open_inbox(window, cx);
                if let (Some(key), Some(inbox)) = (key.clone(), &self.inbox) {
                    inbox.update(cx, |inbox, cx| inbox.open_item(key, cx));
                }
            }
        }
    }
}
