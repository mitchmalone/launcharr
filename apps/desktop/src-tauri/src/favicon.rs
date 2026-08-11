use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

use url::Url;

/// User-initiated favicon fetch for quicklinks — the one sanctioned network touchpoint in
/// launcharr (DECISIONS 2026-08-09). Called exactly once, when a quicklink is added; never
/// in the background.
///
/// Quality order: apple-touch-icon (usually 180px) > `<link rel=icon>` with the largest
/// `sizes` > conventional /apple-touch-icon.png > favicon.ico as the explicit last resort.
const HTML_LIMIT: u64 = 512 * 1024;
const ICON_LIMIT: u64 = 2 * 1024 * 1024;
const ICON_SIZE: u32 = 64;

pub fn link_icon_name(link_url: &str) -> String {
    let mut hasher = DefaultHasher::new();
    link_url.hash(&mut hasher);
    format!("link-{:016x}.png", hasher.finish())
}

pub fn link_icon_path(icon_dir: &Path, link_url: &str) -> PathBuf {
    icon_dir.join(link_icon_name(link_url))
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(4))
        .timeout(Duration::from_secs(6))
        .user_agent("launcharr-favicon/0.1")
        .build()
}

fn get_limited(agent: &ureq::Agent, url: &str, limit: u64) -> Option<Vec<u8>> {
    let response = agent.get(url).call().ok()?;
    let mut buf = Vec::new();
    response
        .into_reader()
        .take(limit)
        .read_to_end(&mut buf)
        .ok()?;
    if buf.is_empty() {
        None
    } else {
        Some(buf)
    }
}

/// Scan `<link rel="…">` tags for icon candidates, best first. Pure; regex-free tag walk
/// (a full HTML parser is not worth a dependency for `<head>` scanning).
pub fn icon_candidates(html: &str, base: &Url) -> Vec<String> {
    let mut scored: Vec<(i64, String)> = Vec::new();

    let lower = html.to_lowercase();
    let mut cursor = 0usize;
    while let Some(start) = lower[cursor..].find("<link") {
        let start = cursor + start;
        let Some(end) = lower[start..].find('>') else {
            break;
        };
        let end = start + end;
        let tag = &html[start..=end];
        cursor = end + 1;

        let rel = attr(tag, "rel").unwrap_or_default().to_lowercase();
        let Some(href) = attr(tag, "href") else {
            continue;
        };
        let Ok(resolved) = base.join(&href) else {
            continue;
        };
        // SVGs (mask-icon, many modern favicons) can't be rasterized without another dep.
        if resolved.path().to_lowercase().ends_with(".svg") {
            continue;
        }

        let sizes = attr(tag, "sizes").unwrap_or_default();
        let size: i64 = sizes
            .split_whitespace()
            .filter_map(|s| s.split(['x', 'X']).next())
            .filter_map(|s| s.parse::<i64>().ok())
            .max()
            .unwrap_or(0);

        let score = if rel.contains("apple-touch-icon") {
            1000 + size.max(180)
        } else if rel
            .split_whitespace()
            .any(|r| r == "icon" || r == "shortcut")
        {
            if resolved.path().to_lowercase().ends_with(".ico") {
                size // .ico stays at the bottom of the pile
            } else {
                500 + size
            }
        } else {
            continue;
        };
        scored.push((score, resolved.to_string()));
    }

    scored.sort_by_key(|(score, _)| -score);
    let mut out: Vec<String> = scored.into_iter().map(|(_, u)| u).collect();

    // Conventional fallbacks, still preferring the touch icon over the ico.
    if let Ok(touch) = base.join("/apple-touch-icon.png") {
        out.push(touch.to_string());
    }
    if let Ok(ico) = base.join("/favicon.ico") {
        out.push(ico.to_string());
    }
    out.dedup();
    out
}

fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let idx = lower.find(&format!("{name}="))?;
    let rest = &tag[idx + name.len() + 1..];
    let (quote, rest) = match rest.chars().next()? {
        q @ ('"' | '\'') => (Some(q), &rest[1..]),
        _ => (None, rest),
    };
    let end = match quote {
        Some(q) => rest.find(q)?,
        None => rest.find([' ', '>']).unwrap_or(rest.len()),
    };
    // Unquoted values in a self-closing tag drag the `/` of `/>` along; drop it.
    let value = rest[..end].trim_end_matches("/").to_string();
    match quote {
        Some(_) => Some(rest[..end].to_string()),
        None if end == 0 => None,
        None => Some(value),
    }
}

/// Fetch the best available icon for a URL into the cache. Returns the cache path on
/// success; any failure is silent (a quicklink without an icon is fine).
pub fn fetch(link_url: &str, icon_dir: &Path) -> Option<PathBuf> {
    let base = Url::parse(link_url).ok()?;
    let origin = base.join("/").ok()?;
    let agent = agent();

    let mut candidates = match get_limited(&agent, origin.as_str(), HTML_LIMIT) {
        Some(bytes) => icon_candidates(&String::from_utf8_lossy(&bytes), &origin),
        None => Vec::new(),
    };
    if candidates.is_empty() {
        candidates = vec![
            origin.join("/apple-touch-icon.png").ok()?.to_string(),
            origin.join("/favicon.ico").ok()?.to_string(),
        ];
    }

    let _ = std::fs::create_dir_all(icon_dir);
    let dest = link_icon_path(icon_dir, link_url);
    for candidate in candidates {
        let Some(bytes) = get_limited(&agent, &candidate, ICON_LIMIT) else {
            continue;
        };
        let Ok(decoded) = image::load_from_memory(&bytes) else {
            continue;
        };
        if decoded.width() < 16 {
            continue;
        }
        let small = decoded.thumbnail(ICON_SIZE, ICON_SIZE);
        if small
            .save_with_format(&dest, image::ImageFormat::Png)
            .is_ok()
        {
            return Some(dest);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://example.com/some/page").unwrap()
    }

    #[test]
    fn prefers_apple_touch_icon_over_everything() {
        let html = r#"
            <link rel="icon" href="/favicon.ico">
            <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-180.png">
        "#;
        let c = icon_candidates(html, &base());
        assert_eq!(c[0], "https://example.com/apple-180.png");
    }

    #[test]
    fn larger_sizes_win_within_a_rel() {
        let html = r#"
            <link rel="icon" sizes="16x16" href="/16.png">
            <link rel="icon" sizes="192x192" href="/192.png">
        "#;
        let c = icon_candidates(html, &base());
        assert_eq!(c[0], "https://example.com/192.png");
    }

    #[test]
    fn ico_ranks_below_png_icons_and_conventional_fallbacks_are_appended() {
        let html = r#"<link rel="shortcut icon" href="/favicon.ico">
                      <link rel="icon" href="/nice.png">"#;
        let c = icon_candidates(html, &base());
        assert_eq!(c[0], "https://example.com/nice.png");
        assert!(c.iter().position(|u| u.ends_with("favicon.ico")).unwrap() > 0);
        assert!(c.contains(&"https://example.com/apple-touch-icon.png".to_string()));
    }

    #[test]
    fn resolves_relative_and_protocol_relative_hrefs() {
        let html = r#"<link rel="icon" href="assets/icon.png">"#;
        let c = icon_candidates(html, &base());
        assert_eq!(c[0], "https://example.com/some/assets/icon.png");
    }

    #[test]
    fn skips_svg_and_unquoted_attrs_parse() {
        let html = r#"<link rel=icon href=/plain.png><link rel="mask-icon" href="/x.svg">"#;
        let c = icon_candidates(html, &base());
        assert_eq!(c[0], "https://example.com/plain.png");
        assert!(!c.iter().any(|u| u.ends_with(".svg")));
    }

    /// Live network test — run manually: cargo test favicon_live -- --ignored
    #[test]
    #[ignore]
    fn favicon_live_fetch_github() {
        let dir = std::env::temp_dir().join("launcharr-favicon-test");
        let got = fetch("https://github.com", &dir);
        assert!(got.is_some(), "no favicon fetched for github.com");
        let bytes = std::fs::read(got.unwrap()).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    }
}
