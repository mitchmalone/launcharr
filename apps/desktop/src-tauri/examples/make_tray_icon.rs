//! Regenerate the menubar (tray) template icon from the design source.
//!
//! Usage: cargo run --example make_tray_icon
//!
//! Takes ../design/menubar-icon-source.png (opaque gray glow background, black flag, white
//! ⌘ glyph) and produces icons/tray.png: a 44×44 macOS template image — pure black + alpha,
//! background removed, glyph cut out so the menubar shows through it.

use image::{imageops, Rgba, RgbaImage};

const DARK_THRESHOLD: u8 = 30; // below: flag body → opaque black; above: bg/glyph → transparent
const OUT_SIZE: u32 = 44; // 22pt @2x
const PADDING: u32 = 1;

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let src_path = root
        .parent()
        .unwrap()
        .join("design/menubar-icon-source.png");
    let out_path = root.join("icons/tray.png");

    let src = image::open(&src_path).expect("read design/menubar-icon-source.png");
    let src = src.to_rgba8();

    // Threshold: only near-black pixels survive, as opaque black. The white glyph and the
    // gray glow both go transparent — the ⌘ becomes a cut-out in the flag.
    let mut mask = RgbaImage::new(src.width(), src.height());
    for (x, y, px) in src.enumerate_pixels() {
        let [r, g, b, a] = px.0;
        let lum = (0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32) as u8;
        let opaque = a > 128 && lum < DARK_THRESHOLD;
        mask.put_pixel(
            x,
            y,
            Rgba(if opaque { [0, 0, 0, 255] } else { [0, 0, 0, 0] }),
        );
    }

    // Crop to content, then fit into the square output with a whisker of padding.
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (u32::MAX, u32::MAX, 0u32, 0u32);
    for (x, y, px) in mask.enumerate_pixels() {
        if px.0[3] > 0 {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
    }
    assert!(min_x < max_x, "no opaque content found — threshold wrong?");
    let cropped =
        imageops::crop_imm(&mask, min_x, min_y, max_x - min_x + 1, max_y - min_y + 1).to_image();

    let inner = OUT_SIZE - 2 * PADDING;
    let (w, h) = (cropped.width(), cropped.height());
    let scale = inner as f32 / w.max(h) as f32;
    let (nw, nh) = (
        ((w as f32 * scale) as u32).max(1),
        ((h as f32 * scale) as u32).max(1),
    );
    let resized = imageops::resize(&cropped, nw, nh, imageops::FilterType::Lanczos3);

    let mut canvas = RgbaImage::new(OUT_SIZE, OUT_SIZE);
    imageops::overlay(
        &mut canvas,
        &resized,
        ((OUT_SIZE - nw) / 2) as i64,
        ((OUT_SIZE - nh) / 2) as i64,
    );

    canvas.save(&out_path).expect("write icons/tray.png");
    println!(
        "wrote {} ({}×{}, content {}×{})",
        out_path.display(),
        OUT_SIZE,
        OUT_SIZE,
        nw,
        nh
    );
}
