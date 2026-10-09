//! XChaCha20-Poly1305 for the crash journal, as one synchronous exported call.
//!
//! **The shape is dictated by the journal's contract, not by taste.** §12 requires
//! the seal to complete inside a handler that must not return until the write has
//! happened, so every part of the boundary here is synchronous: fixed static
//! buffers rather than an allocator, raw pointers rather than wasm-bindgen's glue,
//! and one exported function that returns a length.
//!
//! **`no_std` and no allocator is a size decision with a correctness dividend.**
//! There is no heap, so there is no allocation failure path inside a routine the
//! journal cannot retry, and `dlmalloc` — which a default `wasm32-unknown-unknown`
//! build links in whole — never enters the module.
//!
//! **The construction is row 2's, unchanged**: XChaCha20-Poly1305, a 24-byte nonce
//! supplied per record by the caller, ciphertext and tag combined in that order,
//! which is what `test/vectors/journal-aead.json` publishes and what the pure-JS
//! candidates already produce.

#![no_std]

use chacha20poly1305::aead::{AeadInPlace, KeyInit};
use chacha20poly1305::{Key, Tag, XChaCha20Poly1305, XNonce};

/// Larger than any AAD row 3 or row 2 defines; small enough to cost nothing.
const MAX_AAD: usize = 4096;

/// The largest payload the benchmark measures is 4 kB. This is well past it, so
/// the module is not the thing that decides what a journal record may hold —
/// and being `.bss`, it costs memory pages rather than module bytes.
const MAX_PLAINTEXT: usize = 65536;

const TAG: usize = 16;

static mut KEY: [u8; 32] = [0; 32];
static mut NONCE: [u8; 24] = [0; 24];
static mut AAD: [u8; MAX_AAD] = [0; MAX_AAD];
static mut BUF: [u8; MAX_PLAINTEXT + TAG] = [0; MAX_PLAINTEXT + TAG];

/// `panic = "abort"` still needs a handler in a `no_std` cdylib.
///
/// It traps rather than unwinding, which is the honest behaviour for a seal that
/// cannot fail on well-formed input: a trap is visible to the caller as an
/// exception, where a silently-wrong return would be a journal record nobody can
/// open.
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

#[no_mangle]
pub extern "C" fn key_ptr() -> *mut u8 {
    (&raw mut KEY).cast()
}

#[no_mangle]
pub extern "C" fn nonce_ptr() -> *mut u8 {
    (&raw mut NONCE).cast()
}

#[no_mangle]
pub extern "C" fn aad_ptr() -> *mut u8 {
    (&raw mut AAD).cast()
}

/// One buffer in and out: the caller writes plaintext here and reads
/// ciphertext‖tag back from the same place, because the AEAD is applied in place.
#[no_mangle]
pub extern "C" fn buf_ptr() -> *mut u8 {
    (&raw mut BUF).cast()
}

#[no_mangle]
pub extern "C" fn max_aad() -> usize {
    MAX_AAD
}

#[no_mangle]
pub extern "C" fn max_plaintext() -> usize {
    MAX_PLAINTEXT
}

/// Seal `buf[..plaintext_len]` in place under the staged key, nonce and AAD.
///
/// Returns the combined ciphertext length (`plaintext_len + 16`), or `-1` if the
/// caller asked for more than the buffers hold. The length check is here rather
/// than only in the JS glue so that a wrong call traps at the boundary instead of
/// reading whatever follows the buffer.
#[no_mangle]
pub extern "C" fn seal(aad_len: usize, plaintext_len: usize) -> isize {
    if aad_len > MAX_AAD || plaintext_len > MAX_PLAINTEXT {
        return -1;
    }

    // SAFETY: single-threaded wasm with no re-entrancy — the only caller is the
    // JS glue, which stages the inputs and calls this to completion before it
    // touches the buffers again.
    unsafe {
        let key = &*(&raw const KEY);
        let nonce = &*(&raw const NONCE);
        let aad = &(&*(&raw const AAD))[..aad_len];
        let buf = &mut (&mut *(&raw mut BUF))[..plaintext_len];

        let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
        let Ok(tag) = cipher.encrypt_in_place_detached(XNonce::from_slice(nonce), aad, buf) else {
            return -1;
        };

        let out = &mut *(&raw mut BUF);
        out[plaintext_len..plaintext_len + TAG].copy_from_slice(&tag);
    }

    (plaintext_len + TAG) as isize
}

/// Authenticate before returning plaintext. The JS boundary clears staged
/// buffers on both success and refusal; no unauthenticated bytes are returned.
#[no_mangle]
pub extern "C" fn open(aad_len: usize, ciphertext_len: usize) -> isize {
    if aad_len > MAX_AAD || ciphertext_len < TAG || ciphertext_len > MAX_PLAINTEXT + TAG {
        return -1;
    }
    let plaintext_len = ciphertext_len - TAG;
    // SAFETY: the same fixed-buffer, single-threaded/no-reentrancy contract as seal.
    unsafe {
        let key = &*(&raw const KEY);
        let nonce = &*(&raw const NONCE);
        let aad = &(&*(&raw const AAD))[..aad_len];
        let tag = Tag::clone_from_slice(&(&*(&raw const BUF))[plaintext_len..ciphertext_len]);
        let buf = &mut (&mut *(&raw mut BUF))[..plaintext_len];
        let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
        if cipher.decrypt_in_place_detached(XNonce::from_slice(nonce), aad, buf, &tag).is_err() {
            return -1;
        }
    }
    plaintext_len as isize
}
