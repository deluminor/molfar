mod constants;
#[cfg(test)]
mod tests;
use crate::{
    store::Store,
    task_board::{read, types::Card},
};

impl Store {
    /// `projects` must come from current caller assignments or grants, never tool arguments.
    /// Missing and unauthorized cards deliberately share the same error.
    pub fn board_scoped_card(&self, id: &str, projects: &[String]) -> Result<Card, String> {
        let card = read::card(&self.conn, id).map_err(|error| error.to_string())?;

        card.filter(|card| allowed(projects, &card.project_cwd))
            .ok_or_else(|| "Board card not found.".into())
    }
}

impl Store {
    /// Uses current trusted project grants; offsets count Unicode scalar values.
    pub fn board_scoped_artifact(
        &self,
        id: &str,
        projects: &[String],
        input: &crate::task_board::types::ArtifactRead<'_>,
    ) -> Result<crate::task_board::types::ArtifactPage, String> {
        let crate::task_board::types::ArtifactRead {
            kind,
            version,
            max_chars,
            char_offset,
        } = *input;
        self.board_scoped_card(id, projects)?;
        if !(1..=constants::MAX_TEXT_PAGE).contains(&max_chars) {
            return Err("Invalid artifact page size.".into());
        }

        let body = self.board_stage_artifact(id, kind, version)?;
        let total = body.chars().count();
        if char_offset > total {
            return Err("Artifact character offset exceeds content length.".into());
        }
        let body: String = body.chars().skip(char_offset).take(max_chars).collect();
        let end = char_offset + body.chars().count();

        Ok(crate::task_board::types::ArtifactPage {
            body,
            next_char_offset: (end < total).then_some(end),
        })
    }
}

impl Store {
    /// Projects must come from current trusted grants; no project lists all of them.
    /// Every page rechecks access. Offsets describe the current list, so concurrent
    /// edits may shift page boundaries.
    pub fn board_scoped_list(
        &self,
        project: Option<&str>,
        projects: &[String],
        archived: bool,
        offset: u32,
        limit: u32,
    ) -> Result<Vec<Card>, String> {
        if project.is_some_and(|project| !allowed(projects, project)) {
            return Err("Board project not found.".into());
        }
        if !(1..=constants::MAX_LIST_ENTRIES).contains(&limit) {
            return Err("Invalid Board page size.".into());
        }

        let cards = read::list_page(&self.conn, archived)
            .map_err(|error| format!("Cannot read Board page: {error}"))?;
        Ok(cards
            .into_iter()
            .filter(|card| match project {
                Some(project) => same_project(project, &card.project_cwd),
                None => allowed(projects, &card.project_cwd),
            })
            .skip(offset as usize)
            .take(limit as usize)
            .collect())
    }
}

fn same_project(left: &str, right: &str) -> bool {
    crate::files::path_key(left) == crate::files::path_key(right)
}

fn allowed(projects: &[String], project: &str) -> bool {
    projects
        .iter()
        .any(|allowed| same_project(allowed, project))
}

impl Store {
    /// Current Grill questions only; earlier rounds stay in the artifact history.
    pub fn board_scoped_questions(
        &self,
        id: &str,
        projects: &[String],
    ) -> Result<Vec<crate::task_board::stage::owner::types::Question>, String> {
        self.board_scoped_card(id, projects)?;
        crate::task_board::stage::owner::current_questions(
            &self.conn,
            &self.board_artifact_base()?,
            id,
        )
    }
}
