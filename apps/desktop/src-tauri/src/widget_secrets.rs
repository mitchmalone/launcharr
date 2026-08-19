//! Widget secrets: the values a manifest declares `secret: true` (tokens), kept
//! in the macOS Keychain as generic passwords — service `launcharr`, account
//! `widget/<id>/<KEY>`. Never in config.json (plain text, dotfiles, hot-watched)
//! and never sent to a webview: the settings UI only learns *whether* a key is
//! set. Plain settings live in `config.widgets`; both reach a widget as env
//! (widgets.rs). Keychain access goes through Security.framework rather than
//! `/usr/bin/security`, whose argv would put the secret in `ps` (plan:
//! docs/plans/active/widget-settings.md).

use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE: &str = "launcharr";

fn account(id: &str, key: &str) -> String {
    format!("widget/{id}/{key}")
}

/// Store (or, with an empty value, delete) one secret.
pub fn set(id: &str, key: &str, value: &str) -> Result<(), String> {
    if value.is_empty() {
        return delete(id, key);
    }
    set_generic_password(SERVICE, &account(id, key), value.as_bytes())
        .map_err(|e| format!("keychain write failed: {e}"))
}

/// Read one secret; None when unset (or unreadable — a widget then simply
/// runs without it, the same as an unset key).
pub fn get(id: &str, key: &str) -> Option<String> {
    get_generic_password(SERVICE, &account(id, key))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

/// Delete one secret; a missing item is not an error.
pub fn delete(id: &str, key: &str) -> Result<(), String> {
    match delete_generic_password(SERVICE, &account(id, key)) {
        Ok(()) => Ok(()),
        // errSecItemNotFound
        Err(e) if e.code() == -25300 => Ok(()),
        Err(e) => Err(format!("keychain delete failed: {e}")),
    }
}

/// Which of `keys` are set — what the settings UI is allowed to know.
pub fn present(id: &str, keys: &[String]) -> Vec<String> {
    keys.iter()
        .filter(|k| get(id, k).is_some())
        .cloned()
        .collect()
}
