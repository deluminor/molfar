use molfar_core::knowledge::VaultDocument;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Draft {
    pub revision: String,
    pub disk: String,
    pub crlf: bool,
    pub text: String,
    pub conflict: bool,
}

pub(crate) fn to_editor(body: &str) -> (String, bool) {
    let crlf = body.contains("\r\n");
    (body.replace("\r\n", "\n"), crlf)
}

pub(crate) fn to_disk(text: &str, crlf: bool) -> String {
    if crlf {
        text.replace('\n', "\r\n")
    } else {
        text.to_string()
    }
}

pub(crate) fn draft_from(document: &VaultDocument) -> Draft {
    let (text, crlf) = to_editor(&document.body);
    Draft {
        revision: document.revision.clone(),
        disk: text.clone(),
        crlf,
        text,
        conflict: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crlf_notes_round_trip_through_the_editor() {
        let (text, crlf) = to_editor("Line\r\nTwo\r\n");
        assert!(crlf);
        assert_eq!(text, "Line\nTwo\n");
        assert_eq!(to_disk(&text, true), "Line\r\nTwo\r\n");
        assert_eq!(to_disk("Line\n", false), "Line\n");
    }
}
