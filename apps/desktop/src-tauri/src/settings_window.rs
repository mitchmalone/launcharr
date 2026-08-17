use tauri::{AppHandle, Emitter, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

use crate::error::{CmdError, CmdResult};

/// The settings window — created on demand, focused if it already exists. A normal activating
/// window (the panel's non-activating rules don't apply here; you're configuring, not
/// launching). Titlebar is overlay-style: traffic lights float over the webview's tab strip,
/// which doubles as the drag region.
pub fn open(app: &AppHandle) -> CmdResult<()> {
    open_tab(app, None)
}

/// Open on a specific tab (validated id, e.g. "desktop" for the adopt prompt): a
/// fresh window gets it as the URL hash, an existing one via the `settings-tab`
/// event. Unknown ids just open the window.
pub fn open_tab(app: &AppHandle, tab: Option<&str>) -> CmdResult<()> {
    let tab = tab.filter(|t| t.chars().all(|c| c.is_ascii_lowercase()));
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.show();
        let _ = existing.set_focus();
        if let Some(t) = tab {
            let _ = existing.emit("settings-tab", t);
        }
        return Ok(());
    }
    let url = match tab {
        Some(t) => format!("settings.html#{t}"),
        None => "settings.html".to_owned(),
    };
    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("launcharr settings")
        .inner_size(680.0, 720.0)
        .resizable(true)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .build()
        .map_err(|e| CmdError::Internal(format!("settings window: {e}")))?;
    Ok(())
}
