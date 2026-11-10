//! Every navigation destination can be hidden from Sidebar options. One
//! predicate serves the sidebar and both project-rail layouts.
use super::*;

/// Menu id, label and icon for each switchable destination, in navigation order.
const DESTINATIONS: [(&str, &str, &str); 7] = [
    ("sidebar-home", "Home", "home"),
    ("sidebar-new", "New session", "square-plus"),
    ("sidebar-inbox", "Inbox", "inbox"),
    ("sidebar-board", "Board", "dashboard"),
    ("sidebar-notes", "Notes", "note"),
    ("sidebar-knowledge", "Knowledge", "folder-tree"),
    ("sidebar-automations", "Automations", "zap"),
];

impl Shell {
    /// Whether the navigation row labelled `label` is shown.
    pub(super) fn nav_visible(&self, label: &str) -> bool {
        let workspace = &self.workspace;
        match label {
            "Home" => workspace.sidebar_home_visible,
            "New" => workspace.sidebar_new_visible,
            "Inbox" => workspace.sidebar_inbox_visible,
            "Board" => workspace.sidebar_board_visible,
            "Notes" => workspace.preferences.notes && workspace.sidebar_notes_visible,
            "Knowledge" => workspace.sidebar_knowledge_visible,
            "Automations" => workspace.sidebar_automations_visible,
            _ => true,
        }
    }

    fn nav_flag(&mut self, action: &str) -> Option<&mut bool> {
        let workspace = &mut self.workspace;
        Some(match action {
            "sidebar-search" => &mut workspace.sidebar_search_visible,
            "sidebar-home" => &mut workspace.sidebar_home_visible,
            "sidebar-new" => &mut workspace.sidebar_new_visible,
            "sidebar-inbox" => &mut workspace.sidebar_inbox_visible,
            "sidebar-board" => &mut workspace.sidebar_board_visible,
            "sidebar-notes" => &mut workspace.sidebar_notes_visible,
            "sidebar-knowledge" => &mut workspace.sidebar_knowledge_visible,
            "sidebar-automations" => &mut workspace.sidebar_automations_visible,
            "sidebar-familiars" => &mut workspace.preferences.familiars,
            "sidebar-activity" => &mut workspace.sidebar_activity_visible,
            "compact-session-cards" => &mut workspace.compact_session_cards,
            _ => return None,
        })
    }

    fn nav_flag_value(&self, action: &str) -> bool {
        let workspace = &self.workspace;
        match action {
            "sidebar-home" => workspace.sidebar_home_visible,
            "sidebar-new" => workspace.sidebar_new_visible,
            "sidebar-inbox" => workspace.sidebar_inbox_visible,
            "sidebar-board" => workspace.sidebar_board_visible,
            "sidebar-notes" => workspace.sidebar_notes_visible,
            "sidebar-knowledge" => workspace.sidebar_knowledge_visible,
            "sidebar-automations" => workspace.sidebar_automations_visible,
            _ => true,
        }
    }

    pub(super) fn sidebar_options_menu_items(&self) -> Vec<MenuItem> {
        let workspace = &self.workspace;
        let mut items: Vec<MenuItem> = vec![
            MenuAction::new("sidebar-search", "Search")
                .icon("search")
                .toggle(workspace.sidebar_search_visible)
                .into(),
            MenuItem::Separator,
        ];
        items.extend(DESTINATIONS.iter().map(|(id, label, glyph)| {
            let disabled = match *id {
                "sidebar-notes" => !workspace.preferences.notes,
                // Only the Focused layout lists New in the navigation.
                "sidebar-new" => workspace.classic_layout,
                _ => false,
            };
            MenuAction::new(*id, *label)
                .icon(glyph)
                .toggle(self.nav_flag_value(id))
                .disabled(disabled)
                .into()
        }));
        items.extend([
            MenuItem::Separator,
            MenuAction::new("sidebar-familiars", "Familiars")
                .icon("ghost")
                .toggle(workspace.preferences.familiars)
                .into(),
            MenuAction::new("sidebar-activity", "Activity")
                .icon("response-activity")
                .toggle(workspace.sidebar_activity_visible)
                .disabled(!workspace.preferences.working_agents)
                .into(),
            MenuItem::Separator,
            MenuAction::new("compact-session-cards", "Compact view")
                .icon("list-bullet")
                .toggle(workspace.compact_session_cards)
                .into(),
        ]);
        items
    }

    pub(super) fn change_sidebar_option(&mut self, action: &str, cx: &mut Context<Self>) {
        let Some(value) = self.nav_flag(action) else {
            return;
        };
        *value = !*value;
        if action == "sidebar-familiars" {
            self.apply_preferences(cx);
            self.sync_settings(cx);
        }
        self.close_preview(cx);
        self.sidebar_list.remeasure();
        self.persist(cx);
        cx.notify();
    }
}
