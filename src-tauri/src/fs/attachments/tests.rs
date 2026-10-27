use super::*;

use crate::fs::read::read_file_base64_sync;

#[test]
fn generated_image_validation_accepts_png_only() {
    assert!(is_png(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    assert!(!is_png(&[0xff, 0xd8, 0xff, 0x00]));
    assert!(!is_png(b"<html>"));
    assert!(!is_png(&[]));
}

#[test]
fn attachment_bytes_round_trip_through_temp_dir() {
    let encoded =
        read_file_base64_sync(&write_attachment_sync("shot.png", "aGVsbG8=").unwrap()).unwrap();
    assert_eq!(encoded, "aGVsbG8=");
    assert_eq!(safe_attachment_name("../../secret.png"), "secret.png");
    assert_eq!(safe_attachment_name(""), "attachment");
}
