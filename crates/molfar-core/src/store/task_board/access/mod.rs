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

        card.filter(|card| projects.contains(&card.project_cwd))
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
    /// Projects must come from current trusted grants. Every page rechecks access.
    /// Offsets describe the current list; concurrent edits may shift page boundaries.
    pub fn board_scoped_list(
        &self,
        project: &str,
        projects: &[String],
        archived: bool,
        offset: u32,
        limit: u32,
    ) -> Result<Vec<Card>, String> {
        if !projects.iter().any(|allowed| allowed == project) {
            return Err("Board project not found.".into());
        }
        if !(1..=constants::MAX_LIST_ENTRIES).contains(&limit) {
            return Err("Invalid Board page size.".into());
        }

        read::list_page(&self.conn, project, archived, offset, limit)
            .map_err(|error| format!("Cannot read Board page: {error}"))
    }
}
