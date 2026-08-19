//! How a plugin file (script or widget) gets executed. TypeScript is the
//! plugin language (DECISIONS 2026-08-19): a `.ts`/`.js` file runs under
//! **Bun**, falling back to Node when Bun is absent; anything else must be an
//! executable and runs directly (bash, python, a compiled binary — any
//! language still works, TS is simply the one that needs no shebang and no
//! chmod).
//!
//! launcharr launched from Finder inherits a bare PATH — no nvm/Volta/brew
//! shims — so runtimes are located explicitly, the way deps.rs finds
//! `aerospace`. Resolution is cached for the process: one directory walk,
//! not one per tick.

use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

/// Extensions that mean "run me under a JS runtime".
const JS_EXTENSIONS: [&str; 5] = ["ts", "tsx", "js", "mjs", "cjs"];

/// Where Bun installs itself, after PATH and Homebrew.
fn bun_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(home) = dirs::home_dir() {
        v.push(home.join(".bun/bin/bun"));
    }
    v
}

/// Node from version managers, after PATH and Homebrew: Volta, fnm, and the
/// highest nvm version installed.
fn node_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return v;
    };
    v.push(home.join(".volta/bin/node"));
    for dir in [
        home.join(".nvm/versions/node"),
        home.join(".local/share/fnm/node-versions"),
        home.join("Library/Application Support/fnm/node-versions"),
    ] {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut versions: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
            // Lexical sort is wrong for v9 vs v10; sort by parsed semver when possible.
            versions.sort_by_key(|p| semver_key(p));
            for p in versions.into_iter().rev() {
                v.push(p.join("bin/node"));
                v.push(p.join("installation/bin/node")); // fnm layout
            }
        }
    }
    v
}

/// (major, minor, patch) from a `v22.6.0`-style directory name; zeros if not.
fn semver_key(p: &Path) -> (u64, u64, u64) {
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let mut parts = name
        .trim_start_matches('v')
        .split('.')
        .map(|s| s.parse().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn first_executable(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates
        .into_iter()
        .find(|p| crate::deps::is_executable(p))
}

/// The JS runtime for plugins: Bun, else Node. `None` = neither found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsRuntime {
    pub path: PathBuf,
    pub bun: bool,
}

static RUNTIME: OnceLock<Option<JsRuntime>> = OnceLock::new();

/// Locate once per process. Bun on PATH/Homebrew/~/.bun first — it runs `.ts`
/// natively and starts in ~10 ms — then Node (which strips types from 22.6).
pub fn js_runtime() -> Option<JsRuntime> {
    RUNTIME
        .get_or_init(|| {
            if let Some(path) =
                crate::deps::locate("bun").or_else(|| first_executable(bun_candidates()))
            {
                return Some(JsRuntime { path, bun: true });
            }
            crate::deps::locate("node")
                .or_else(|| first_executable(node_candidates()))
                .map(|path| JsRuntime { path, bun: false })
        })
        .clone()
}

/// Human hint for a plugin that needs a runtime nobody has.
pub const NO_RUNTIME_HINT: &str = "needs bun — brew install oven-sh/bun/bun";

pub fn is_js(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| JS_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Whether this file is a plugin candidate at all: a JS/TS source (runtime
/// decides), or any executable file.
pub fn is_plugin_file(path: &Path) -> bool {
    path.is_file() && (is_js(path) || crate::deps::is_executable(path))
}

/// The command that runs `path`: `bun path` / `node path` for JS/TS, the file
/// itself otherwise. Err with a hint when a JS runtime is needed but missing.
/// The runtime's directory is prepended to the child's PATH so a plugin can
/// spawn `bun`/`node`/`npx` itself.
pub fn command_for(path: &Path) -> Result<Command, String> {
    if !is_js(path) {
        return Ok(Command::new(path));
    }
    let rt = js_runtime().ok_or_else(|| NO_RUNTIME_HINT.to_string())?;
    let mut cmd = Command::new(&rt.path);
    if rt.bun {
        cmd.arg("run");
    }
    cmd.arg(path);
    if let Some(dir) = rt.path.parent() {
        let mut paths: Vec<PathBuf> = vec![dir.to_path_buf()];
        if let Some(existing) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&existing));
        }
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
    }
    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn js_files_are_recognised_by_extension() {
        assert!(is_js(Path::new("/x/uptime.ts")));
        assert!(is_js(Path::new("/x/UPTIME.TS")));
        assert!(is_js(Path::new("/x/a.mjs")));
        assert!(!is_js(Path::new("/x/a.py")));
        assert!(!is_js(Path::new("/x/noext")));
    }

    #[test]
    fn semver_dirs_sort_numerically() {
        let mut v = [
            PathBuf::from("/n/v9.11.0"),
            PathBuf::from("/n/v22.6.0"),
            PathBuf::from("/n/v10.0.1"),
        ];
        v.sort_by_key(|p| semver_key(p));
        assert_eq!(v.last().unwrap(), &PathBuf::from("/n/v22.6.0"));
        assert_eq!(v.first().unwrap(), &PathBuf::from("/n/v9.11.0"));
    }

    #[test]
    fn non_js_files_run_directly() {
        let cmd = command_for(Path::new("/bin/echo")).unwrap();
        assert_eq!(cmd.get_program(), "/bin/echo");
    }

    #[test]
    fn js_files_run_under_the_located_runtime() {
        // On a machine with bun or node this proves the argv shape; without
        // either it proves the hint. Both are the contract.
        match command_for(Path::new("/tmp/w.ts")) {
            Ok(cmd) => {
                let args: Vec<_> = cmd
                    .get_args()
                    .map(|a| a.to_string_lossy().into_owned())
                    .collect();
                assert_eq!(args.last().map(String::as_str), Some("/tmp/w.ts"));
                assert!(cmd.get_envs().any(|(k, _)| k == "PATH"));
            }
            Err(e) => assert_eq!(e, NO_RUNTIME_HINT),
        }
    }
}
