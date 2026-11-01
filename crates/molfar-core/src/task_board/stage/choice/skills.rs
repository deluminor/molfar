use std::collections::HashSet;

pub(super) fn resolve(
    configured: Option<&[String]>,
    available: &HashSet<String>,
) -> (Vec<String>, Vec<String>) {
    let mut skills = Vec::new();
    let mut missing = Vec::new();
    if let Some(configured) = configured {
        let mut seen = HashSet::new();
        for name in configured {
            if name.is_empty() || !seen.insert(name.as_str()) {
                continue;
            }
            if available.contains(name) {
                skills.push(name.clone());
            } else {
                missing.push(name.clone());
            }
        }
    } else {
        for preferred in ["d-plan", "d-grill-me", "d-analyze"] {
            if available.contains(preferred) {
                skills.push(preferred.into());
            } else if let Some(fallback) = preferred
                .strip_prefix("d-")
                .filter(|name| available.contains(*name))
            {
                skills.push(fallback.into());
            }
        }
    }
    (skills, missing)
}
