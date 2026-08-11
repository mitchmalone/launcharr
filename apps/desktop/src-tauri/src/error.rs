use serde::Serialize;

/// Error type crossing the IPC boundary — serialized, never stringly-typed on the Rust side.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum CmdError {
    #[error("io error: {0}")]
    Io(String),
    #[error("database error: {0}")]
    Db(String),
    #[error("item not found: {0}")]
    NotFound(String),
    #[error("terminal hand-off failed: {0}")]
    Terminal(String),
    #[error("{0}")]
    Internal(String),
}

impl From<std::io::Error> for CmdError {
    fn from(e: std::io::Error) -> Self {
        CmdError::Io(e.to_string())
    }
}

impl From<rusqlite::Error> for CmdError {
    fn from(e: rusqlite::Error) -> Self {
        CmdError::Db(e.to_string())
    }
}

impl From<tauri::Error> for CmdError {
    fn from(e: tauri::Error) -> Self {
        CmdError::Internal(e.to_string())
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
