pub(super) enum Prefix {
    Complete,
    Pending,
    None,
}

pub(super) fn prefix(remaining: &str, token: &str, left: Option<char>, streaming: bool) -> Prefix {
    if left.is_some_and(char::is_alphanumeric) {
        return Prefix::None;
    }
    if let Some(rest) = remaining.strip_prefix(token) {
        return match rest.chars().next() {
            Some(next) if next.is_alphanumeric() => Prefix::None,
            None if streaming => Prefix::Pending,
            _ => Prefix::Complete,
        };
    }
    if streaming && token.starts_with(remaining) {
        Prefix::Pending
    } else {
        Prefix::None
    }
}
