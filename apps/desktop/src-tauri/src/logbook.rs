//! One-line breadcrumbs to `~/Library/Logs/launcharr.log`. stderr goes nowhere
//! for a Finder/login launch, so decisions that are impossible to reconstruct
//! after the fact ("which picker did I get", "why didn't my hold resume") leave
//! a dated line here. Append-only, best-effort, never blocks a feature.

pub fn breadcrumb(tag: &str, line: &str) {
    eprintln!("[launcharr {tag}] {line}");
    if let Some(home) = dirs::home_dir() {
        let path = home.join("Library/Logs/launcharr.log");
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            use std::io::Write;
            let _ = writeln!(f, "{} {tag}: {line}", crate::frecency::now_secs());
        }
    }
}
