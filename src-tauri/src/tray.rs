use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

use crate::error::{CmdError, CmdResult};

/// The menubar presence (added 2026-08-09, see DECISIONS): a template pirate-flag icon with
/// a small menu — discoverability and a future settings gateway. The panel stays the primary
/// surface; the tray must never grow features the prompt can't reach.
pub fn init(app: &AppHandle) -> CmdResult<()> {
    let summon = MenuItem::with_id(app, "summon", "Summon panel\t⌥Space", true, None::<&str>)
        .map_err(tray_err)?;
    let settings =
        MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>).map_err(tray_err)?;
    let reindex =
        MenuItem::with_id(app, "reindex", "Reindex apps", true, None::<&str>).map_err(tray_err)?;
    let quit =
        MenuItem::with_id(app, "quit", "Quit launcharr", true, None::<&str>).map_err(tray_err)?;

    let menu = MenuBuilder::new(app)
        .item(&summon)
        .separator()
        .item(&settings)
        .item(&reindex)
        .separator()
        .item(&quit)
        .build()
        .map_err(tray_err)?;

    let icon = Image::from_bytes(include_bytes!("../icons/tray.png")).map_err(tray_err)?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "summon" => crate::panel::show(app),
            "settings" => {
                let _ = crate::settings_window::open(app);
            }
            "reindex" => crate::indexer::refresh(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
        .map_err(tray_err)?;

    Ok(())
}

fn tray_err(e: impl std::fmt::Display) -> CmdError {
    CmdError::Internal(format!("tray setup failed: {e}"))
}
