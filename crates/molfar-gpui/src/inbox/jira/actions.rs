pub(crate) const DESCRIPTION_WARNING: &str = "The whole description is replaced.";

#[derive(Clone)]
pub(crate) enum Pending {
    Comment {
        key: String,
        body: String,
    },
    Transition {
        key: String,
        id: String,
        name: String,
    },
    Assign {
        key: String,
    },
    Edit {
        key: String,
        summary: String,
        description: Option<String>,
        labels: Vec<String>,
    },
}

impl Pending {
    pub(crate) fn prompt(&self) -> String {
        match self {
            Self::Comment { key, body } => format!("Comment on {key}: {body}"),
            Self::Transition { key, name, .. } => format!("Transition {key} to {name}?"),
            Self::Assign { key } => format!("Assign {key} to me?"),
            Self::Edit {
                key,
                description: Some(_),
                ..
            } => format!("Edit {key}. {DESCRIPTION_WARNING}"),
            Self::Edit { key, .. } => format!("Edit {key}."),
        }
    }
}
