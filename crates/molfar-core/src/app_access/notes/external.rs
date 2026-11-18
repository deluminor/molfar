use super::{scope, upsert::Fields};
use crate::{app_access::bounded, external_mcp::tools::parse, notes::Note, store::Store};
use serde::Deserialize;
use serde_json::{json, Value};

pub const LIST: &str = "notes_list";
pub const READ: &str = "notes_read";
pub const CREATE: &str = "notes_create";
pub const WRITE: &str = "notes_write";
pub const DELETE: &str = "notes_delete";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct List {
    project: Option<String>,
    #[serde(rename = "limit")]
    _limit: Option<usize>,
    #[serde(rename = "offset")]
    _offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Read {
    id: String,
    #[serde(rename = "maxChars")]
    _max_chars: Option<usize>,
    #[serde(rename = "charOffset")]
    _char_offset: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Create {
    project: String,
    #[serde(rename = "body")]
    _body: String,
    #[serde(rename = "title")]
    _title: Option<String>,
    #[serde(rename = "tags")]
    _tags: Option<Vec<String>>,
    #[serde(rename = "requestId")]
    _request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Write {
    id: String,
    #[serde(rename = "body")]
    _body: Option<String>,
    #[serde(rename = "title")]
    _title: Option<String>,
    #[serde(rename = "tags")]
    _tags: Option<Vec<String>>,
    #[serde(rename = "requestId")]
    _request_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Delete {
    id: String,
    #[serde(rename = "requestId")]
    _request_id: String,
}

pub fn validate(tool: &str, input: &Value) -> Result<(), String> {
    match tool {
        LIST => {
            parse::<List>(input)?;
            bounded(input, "limit", 30, 1, 100)?;
        }
        READ => {
            parse::<Read>(input)?;
            bounded(input, "maxChars", 6000, 1, 6000)?;
        }
        CREATE => {
            parse::<Create>(input)?;
            Fields::parse(input)?;
        }
        WRITE => {
            parse::<Write>(input)?;
            Fields::parse(input)?;
            if ["body", "title", "tags"]
                .iter()
                .all(|key| input.get(key).is_none())
            {
                return Err("Supply title, body or tags to update a note".into());
            }
        }
        DELETE => {
            parse::<Delete>(input)?;
        }
        _ => return Err("Unknown notes tool.".into()),
    }
    Ok(())
}

pub fn target_project(store: &Store, id: &str, projects: &[String]) -> Result<String, String> {
    let notes = store.list_notes()?;
    scope::find(&notes, id, projects, false)?
        .source_cwd
        .clone()
        .ok_or_else(|| "Note not found in this project".into())
}

pub fn exists(store: &Store, id: &str) -> Result<bool, String> {
    Ok(store
        .list_notes()?
        .iter()
        .any(|note| scope::matches_id(note, id)))
}

pub fn action(
    store: &Store,
    tool: &str,
    input: &Value,
    projects: &[String],
    client: &str,
    request: Option<&str>,
) -> Result<Value, String> {
    validate(tool, input)?;
    let notes = store.list_notes()?;
    let find = |id: &str| scope::find(&notes, id, projects, false);

    match tool {
        LIST => {
            let args: List = parse(input)?;
            let selected = args
                .project
                .as_deref()
                .map(|cwd| project(projects, cwd))
                .transpose()?;
            let projects = selected.map_or(projects, std::slice::from_ref);
            let offset = bounded(input, "offset", 0, 0, usize::MAX)?;
            let limit = bounded(input, "limit", 30, 1, 100)?;
            Ok(scope::list(&notes, projects, false, offset, limit))
        }
        READ => {
            let args: Read = parse(input)?;
            let note = find(&args.id)?;
            let max = bounded(input, "maxChars", 6000, 1, 6000)?;
            let offset = bounded(input, "charOffset", 0, 0, usize::MAX)?;
            let total = note.body.chars().count();
            if offset > total {
                return Err("Note character offset exceeds content length.".into());
            }
            let body: String = note.body.chars().skip(offset).take(max).collect();
            let end = offset.saturating_add(max);
            Ok(
                json!({"note":{"id":note.id,"title":note.title,"body":body,"tags":note.tags,"sourceCwd":note.source_cwd},"nextCharOffset":(end < total).then_some(end)}),
            )
        }
        CREATE => {
            let args: Create = parse(input)?;
            let cwd = project(projects, &args.project)?;
            let request = request.ok_or("Note create requires a request ID.")?;
            let hash = crate::familiar::files::content_hash(&format!(
                "{}\n{request}",
                crate::files::path_key(cwd)
            ));
            let id = format!("external-note-{client}-{hash}");
            if let Some(note) = notes.iter().find(|note| note.id == id) {
                let note = find(&note.id)?;
                if !note
                    .source_cwd
                    .as_deref()
                    .is_some_and(|source| scope::same_project(source, cwd))
                {
                    return Err("Note not found in this project".into());
                }
                return Ok(result(note));
            }
            let note = store.upsert_note(&Fields::parse(input)?.into_upsert(
                id,
                None,
                None,
                Some(cwd.clone()),
            )?)?;
            Ok(result(&note))
        }
        WRITE => {
            let args: Write = parse(input)?;
            let current = find(&args.id)?;
            let note = store.upsert_note(&Fields::parse(input)?.into_upsert(
                current.id.clone(),
                Some(current),
                current.source_session_id.clone(),
                current.source_cwd.clone(),
            )?)?;
            Ok(result(&note))
        }
        DELETE => {
            let args: Delete = parse(input)?;
            let note = find(&args.id)?;
            store.delete_note(&note.id)?;
            Ok(json!({"note":{"id":note.id},"deleted":true}))
        }
        _ => Err("Unknown notes tool.".into()),
    }
}

fn project<'a>(projects: &'a [String], cwd: &str) -> Result<&'a String, String> {
    projects
        .iter()
        .find(|project| scope::same_project(project, cwd))
        .ok_or_else(|| "Project not found.".into())
}

fn result(note: &Note) -> Value {
    json!({"note":{"id":note.id,"title":note.title,"tags":note.tags,"sourceCwd":note.source_cwd}})
}
