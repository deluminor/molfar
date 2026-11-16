pub(super) fn label(milliseconds: i128) -> String {
    let minutes = milliseconds.max(0) / 60_000;
    if minutes == 0 {
        return "<1m".into();
    }
    if minutes < 60 {
        return format!("{minutes}m");
    }
    format!("{}h {}m", minutes / 60, minutes % 60)
}
