use super::*;
use molfar_core::files::is_equal_or_inside;

pub(super) type Detached = Vec<(molfar_core::store::Session, molfar_core::agent::Settings)>;

impl Shell {
    /// Why a working copy cannot be removed right now, if anything still uses it.
    pub(super) fn worktree_in_use(&self, path: &str, cx: &App) -> Option<&'static str> {
        let terminal = self
            .terminals
            .values()
            .flatten()
            .any(|terminal| is_equal_or_inside(&terminal.read(cx).cwd, path));
        if terminal {
            return Some("Close the terminals using this worktree first.");
        }

        let busy = self.session_summaries.keys().any(|id| {
            is_equal_or_inside(self.session_working_copy(*id, cx), path)
                && self.sessions.get(id).is_some_and(|view| view.read(cx).busy)
        });
        busy.then_some("Stop the running sessions using this worktree first.")
    }

    /// Keeps detached conversations reachable after their working copy was removed.
    pub(super) fn apply_detached_worktree(
        &mut self,
        path: &str,
        detached: Detached,
        cx: &mut Context<Self>,
    ) {
        for (summary, settings) in detached {
            self.session_summaries.insert(summary.id, summary.clone());
            self.session_worktrees
                .insert(summary.id, settings.worktree_cwd.clone());
            if let Some(view) = self.sessions.get(&summary.id) {
                view.update(cx, |view, cx| view.worktree_deleted(summary, settings, cx));
            }
        }
        self.worktree_focus
            .retain(|_, focus| !is_equal_or_inside(&focus.path, path));
    }
}
