use tauri::{AppHandle, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

use crate::error::{CmdError, CmdResult};

/// The settings window — created on demand, focused if it already exists. A normal activating
/// window (the panel's non-activating rules don't apply here; you're configuring, not
/// launching). Titlebar is overlay-style: traffic lights float over the webview's tab strip,
/// which doubles as the drag region.
pub fn open(app: &AppHandle) -> CmdResult<()> {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("launcharr settings")
        .inner_size(680.0, 720.0)
        .resizable(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .build()
        .map_err(|e| CmdError::Internal(format!("settings window: {e}")))?;
    Ok(())
}
