//! Minimal CoreAudio FFI: enumerate devices, read names, get/set the default
//! input/output device. Hand-declared instead of a binding crate (the tree
//! stays shallow; we need five calls). This is the repo's dedicated-unsafe
//! module for CoreAudio — every block carries its safety argument, and the
//! public surface is safe. The property API needs no TCC permission.

use std::ffi::c_void;

pub type AudioObjectID = u32;

const SYSTEM_OBJECT: AudioObjectID = 1; // kAudioObjectSystemObject

const fn fourcc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

const PROP_DEVICES: u32 = fourcc(b"dev#"); // kAudioHardwarePropertyDevices
const PROP_DEFAULT_OUTPUT: u32 = fourcc(b"dOut"); // kAudioHardwarePropertyDefaultOutputDevice
const PROP_DEFAULT_INPUT: u32 = fourcc(b"dIn "); // kAudioHardwarePropertyDefaultInputDevice
const PROP_NAME: u32 = fourcc(b"lnam"); // kAudioObjectPropertyName (CFString)
const PROP_STREAMS: u32 = fourcc(b"stm#"); // kAudioDevicePropertyStreams
const SCOPE_GLOBAL: u32 = fourcc(b"glob");
const SCOPE_INPUT: u32 = fourcc(b"inpt");
const SCOPE_OUTPUT: u32 = fourcc(b"outp");
const ELEMENT_MAIN: u32 = 0;
const CFSTRING_ENCODING_UTF8: u32 = 0x0800_0100;

#[repr(C)]
struct PropertyAddress {
    selector: u32,
    scope: u32,
    element: u32,
}

#[link(name = "CoreAudio", kind = "framework")]
unsafe extern "C" {
    fn AudioObjectGetPropertyDataSize(
        object: AudioObjectID,
        address: *const PropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        out_size: *mut u32,
    ) -> i32;
    fn AudioObjectGetPropertyData(
        object: AudioObjectID,
        address: *const PropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        io_size: *mut u32,
        out_data: *mut c_void,
    ) -> i32;
    fn AudioObjectSetPropertyData(
        object: AudioObjectID,
        address: *const PropertyAddress,
        qualifier_size: u32,
        qualifier: *const c_void,
        size: u32,
        data: *const c_void,
    ) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringGetCString(
        string: *const c_void,
        buffer: *mut u8,
        buffer_size: isize,
        encoding: u32,
    ) -> u8;
    fn CFRelease(cf: *const c_void);
}

fn address(selector: u32, scope: u32) -> PropertyAddress {
    PropertyAddress {
        selector,
        scope,
        element: ELEMENT_MAIN,
    }
}

/// All audio device ids known to the HAL (inputs, outputs, aggregates).
pub fn device_ids() -> Vec<AudioObjectID> {
    let addr = address(PROP_DEVICES, SCOPE_GLOBAL);
    let mut size: u32 = 0;
    // SAFETY: addr and size outlive the call; qualifier is unused (null, 0).
    let status = unsafe {
        AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &addr, 0, std::ptr::null(), &mut size)
    };
    if status != 0 || size == 0 {
        return Vec::new();
    }
    let count = size as usize / std::mem::size_of::<AudioObjectID>();
    let mut ids = vec![0u32; count];
    // SAFETY: ids has exactly `size` bytes of capacity; the HAL writes at most
    // `size` bytes and updates it downward on shrink.
    let status = unsafe {
        AudioObjectGetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            ids.as_mut_ptr().cast(),
        )
    };
    if status != 0 {
        return Vec::new();
    }
    ids.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
    ids
}

/// Human name of a device, e.g. "Shure MV7+".
pub fn device_name(id: AudioObjectID) -> Option<String> {
    let addr = address(PROP_NAME, SCOPE_GLOBAL);
    let mut cf: *const c_void = std::ptr::null();
    let mut size = std::mem::size_of::<*const c_void>() as u32;
    // SAFETY: out buffer is a single CFStringRef slot, matching `size`.
    let status = unsafe {
        AudioObjectGetPropertyData(
            id,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            (&mut cf as *mut *const c_void).cast(),
        )
    };
    if status != 0 || cf.is_null() {
        return None;
    }
    let mut buf = [0u8; 256];
    // SAFETY: cf is a live CFString we own (get-rule property copy); buf is
    // 256 writable bytes; released exactly once below.
    let (ok, name) = unsafe {
        let ok = CFStringGetCString(
            cf,
            buf.as_mut_ptr(),
            buf.len() as isize,
            CFSTRING_ENCODING_UTF8,
        );
        CFRelease(cf);
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        (ok, String::from_utf8_lossy(&buf[..end]).into_owned())
    };
    (ok != 0 && !name.is_empty()).then_some(name)
}

/// Does the device carry streams in this direction? (input mics vs output
/// speakers; devices can be both.)
pub fn has_streams(id: AudioObjectID, input: bool) -> bool {
    let scope = if input { SCOPE_INPUT } else { SCOPE_OUTPUT };
    let addr = address(PROP_STREAMS, scope);
    let mut size: u32 = 0;
    // SAFETY: same shape as device_ids' size query.
    let status =
        unsafe { AudioObjectGetPropertyDataSize(id, &addr, 0, std::ptr::null(), &mut size) };
    status == 0 && size > 0
}

/// Current default device for the direction, if any.
pub fn default_device(input: bool) -> Option<AudioObjectID> {
    let selector = if input {
        PROP_DEFAULT_INPUT
    } else {
        PROP_DEFAULT_OUTPUT
    };
    let addr = address(selector, SCOPE_GLOBAL);
    let mut id: AudioObjectID = 0;
    let mut size = std::mem::size_of::<AudioObjectID>() as u32;
    // SAFETY: out buffer is one AudioObjectID, matching `size`.
    let status = unsafe {
        AudioObjectGetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            (&mut id as *mut AudioObjectID).cast(),
        )
    };
    (status == 0 && id != 0).then_some(id)
}

/// Make `id` the system default input/output device.
pub fn set_default_device(id: AudioObjectID, input: bool) -> Result<(), String> {
    let selector = if input {
        PROP_DEFAULT_INPUT
    } else {
        PROP_DEFAULT_OUTPUT
    };
    let addr = address(selector, SCOPE_GLOBAL);
    // SAFETY: data is one AudioObjectID with the exact declared size.
    let status = unsafe {
        AudioObjectSetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            std::mem::size_of::<AudioObjectID>() as u32,
            (&id as *const AudioObjectID).cast(),
        )
    };
    if status == 0 {
        Ok(())
    } else {
        Err(format!("CoreAudio set default failed ({status})"))
    }
}
