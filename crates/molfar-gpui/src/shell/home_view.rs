use super::*;
use crate::home;

impl Shell {
    pub(super) fn open_home(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.prepare_app_view(window, cx);
        if self.home.is_none() {
            let stored = self.workspace.home_layout.clone();
            let view = cx.new(|cx| home::Home::new(&stored, cx));
            self.app_view_events.push(cx.subscribe_in(
                &view,
                window,
                |this, _, event: &home::Event, window, cx| match event {
                    home::Event::Close => this.close_app_view(window, cx),
                    home::Event::Layout(layout) => {
                        this.workspace.home_layout = layout.clone();
                        this.persist(cx);
                    }
                },
            ));
            self.home = Some(view);
        }
        if let Some(view) = &self.home {
            view.update(cx, |view, cx| view.reveal(cx));
        }
        self.show_app_view(app_views::AppView::Home, window, cx);
    }
}
