use crate::task_board::kanban::look;
use crate::theme::{accent_color, content};
use gpui::Hsla;
use molfar_core::task_board::stage::lifecycle::constants::{
    CANCELLED, FAILED, INTERRUPTED, PARTIAL, REDIRECTED, RUNNING, SUCCEEDED,
};

pub(super) fn presentation(status: &str) -> (&str, Hsla) {
    match status {
        SUCCEEDED => ("Succeeded", look::emerald(1.)),
        PARTIAL => ("Continued", look::amber(1.)),
        REDIRECTED => ("Sent back", look::amber(1.)),
        FAILED => ("Failed", look::rose(1.)),
        CANCELLED => ("Cancelled", content(0.6)),
        INTERRUPTED => ("Interrupted", look::amber(1.)),
        RUNNING => ("Running", accent_color()),
        _ => (status, content(0.5)),
    }
}

#[test]
fn statuses_preserve_native_labels_and_unknown_text() {
    for (stored, label) in [
        (SUCCEEDED, "Succeeded"),
        (PARTIAL, "Continued"),
        (REDIRECTED, "Sent back"),
        (FAILED, "Failed"),
        (CANCELLED, "Cancelled"),
        (INTERRUPTED, "Interrupted"),
        (RUNNING, "Running"),
        ("queued", "queued"),
        ("future", "future"),
    ] {
        assert_eq!(presentation(stored).0, label);
    }
}
