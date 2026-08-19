//! Wi-Fi signal strength via CoreWLAN, the repo's dedicated-unsafe module for
//! it (same shape as `coreaudio.rs`). Only `rssiValue` is read: unlike the
//! SSID/BSSID, which macOS 14+ redacts without Location Services (JOURNAL
//! 2026-08-16), RSSI needs no permission and no prompt. Dynamic class lookup
//! plus one framework link — no binding crate for two messages.

use objc2::runtime::{AnyClass, AnyObject};

#[link(name = "CoreWLAN", kind = "framework")]
unsafe extern "C" {}

/// Received signal strength of the current association in dBm (typically
/// -30 … -90), or None when there is no Wi-Fi interface / association.
pub fn rssi() -> Option<i32> {
    let cls = AnyClass::get(c"CWWiFiClient")?;
    // SAFETY: documented CoreWLAN class methods and plain getters — a shared
    // singleton, its default interface (nullable), and an NSInteger. Nothing
    // is retained past this call. Callable from any thread.
    unsafe {
        let client: *mut AnyObject = objc2::msg_send![cls, sharedWiFiClient];
        if client.is_null() {
            return None;
        }
        let iface: *mut AnyObject = objc2::msg_send![client, interface];
        if iface.is_null() {
            return None;
        }
        let value: isize = objc2::msg_send![iface, rssiValue];
        // 0 is "not associated", never a real reading.
        (value != 0).then_some(value as i32)
    }
}
