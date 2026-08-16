//! Audio panel data: system volumes via `osascript` (`get/set volume` needs no
//! permission), device lists and default switching via the CoreAudio property
//! API (coreaudio.rs — also permission-free). Volume applies to the current
//! default device, which is how the macOS volume keys behave too.

use serde::Serialize;

use crate::bar_modules::run;
use crate::coreaudio;
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStatus {
    pub output_volume: Option<u8>,
    pub input_volume: Option<u8>,
    pub output_muted: bool,
    pub outputs: Vec<AudioDevice>,
    pub inputs: Vec<AudioDevice>,
    pub default_output: Option<u32>,
    pub default_input: Option<u32>,
}

pub fn status() -> AudioStatus {
    let (output_volume, input_volume, output_muted) =
        run("/usr/bin/osascript", &["-e", "get volume settings"])
            .as_deref()
            .map(parse_volume_settings)
            .unwrap_or((None, None, false));
    let (outputs, inputs) = devices();
    AudioStatus {
        output_volume,
        input_volume,
        output_muted,
        outputs,
        inputs,
        default_output: coreaudio::default_device(false),
        default_input: coreaudio::default_device(true),
    }
}

fn devices() -> (Vec<AudioDevice>, Vec<AudioDevice>) {
    let mut outputs = Vec::new();
    let mut inputs = Vec::new();
    for id in coreaudio::device_ids() {
        let Some(name) = coreaudio::device_name(id) else {
            continue;
        };
        if coreaudio::has_streams(id, false) {
            outputs.push(AudioDevice {
                id,
                name: name.clone(),
            });
        }
        if coreaudio::has_streams(id, true) {
            inputs.push(AudioDevice { id, name });
        }
    }
    (outputs, inputs)
}

pub fn set_volume(input: bool, pct: u8) -> CmdResult<()> {
    let pct = pct.min(100);
    let which = if input { "input" } else { "output" };
    run(
        "/usr/bin/osascript",
        &["-e", &format!("set volume {which} volume {pct}")],
    )
    .map(|_| ())
    .ok_or_else(|| CmdError::Internal("osascript failed to set volume".into()))
}

pub fn set_muted(muted: bool) -> CmdResult<()> {
    run(
        "/usr/bin/osascript",
        &["-e", &format!("set volume output muted {muted}")],
    )
    .map(|_| ())
    .ok_or_else(|| CmdError::Internal("osascript failed to set mute".into()))
}

pub fn set_default_device(id: u32, input: bool) -> CmdResult<()> {
    coreaudio::set_default_device(id, input).map_err(CmdError::Internal)
}

/// `output volume:30, input volume:80, alert volume:100, output muted:false`
/// Volumes read `missing value` when a direction has no device.
fn parse_volume_settings(out: &str) -> (Option<u8>, Option<u8>, bool) {
    let mut output = None;
    let mut input = None;
    let mut muted = false;
    for part in out.trim().split(", ") {
        let Some((key, value)) = part.split_once(':') else {
            continue;
        };
        match key {
            "output volume" => output = value.parse().ok(),
            "input volume" => input = value.parse().ok(),
            "output muted" => muted = value == "true",
            _ => {}
        }
    }
    (output, input, muted)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real-HAL smoke test — hardware-dependent, so ignored in the suite.
    /// Run by hand: `cargo test audio -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn smoke_real_devices() {
        let status = status();
        println!("{status:#?}");
        assert!(!status.outputs.is_empty());
        assert!(status.default_output.is_some());
    }

    #[test]
    fn parses_volume_settings() {
        assert_eq!(
            parse_volume_settings(
                "output volume:30, input volume:80, alert volume:100, output muted:false\n"
            ),
            (Some(30), Some(80), false)
        );
        assert_eq!(
            parse_volume_settings(
                "output volume:0, input volume:missing value, alert volume:100, output muted:true"
            ),
            (Some(0), None, true)
        );
        assert_eq!(parse_volume_settings(""), (None, None, false));
    }
}
