use super::Knowledge;
use gpui::{Context, Window};

impl Knowledge {
    pub(super) fn choose(&mut self, cx: &mut Context<Self>) {
        let prompt = cx.prompt_for_paths(gpui::PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Choose vault folder".into()),
        });
        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(paths))) = prompt.await
                && let Some(path) = paths.into_iter().next()
            {
                let path = path.to_string_lossy().into_owned();
                let _ = this.update(cx, |this, cx| {
                    this.service
                        .update(cx, |service, cx| service.connect(path, cx));
                });
            }
        })
        .detach();
    }

    pub(super) fn disconnect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.stash(cx);
        if !self
            .drafts
            .values()
            .any(|draft| draft.conflict || draft.text != draft.disk)
        {
            self.forget(cx);
            return;
        }
        let answer = window.prompt(
            gpui::PromptLevel::Warning,
            "Discard drafts and disconnect?",
            Some("Unsaved note edits stay only in this session and will be lost."),
            &["Disconnect", "Cancel"],
            cx,
        );
        cx.spawn(async move |this, cx| {
            if answer.await == Ok(0) {
                let _ = this.update(cx, |this, cx| this.forget(cx));
            }
        })
        .detach();
    }

    fn forget(&mut self, cx: &mut Context<Self>) {
        self.service
            .update(cx, |service, cx| service.disconnect(cx));
    }
}
