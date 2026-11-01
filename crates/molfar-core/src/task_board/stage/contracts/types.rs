#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedArtifact {
    pub kind: String,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestReference {
    pub kind: String,
    pub version: i64,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HandoffInput {
    pub kind: String,
    pub version: i64,
    pub body: String,
}
