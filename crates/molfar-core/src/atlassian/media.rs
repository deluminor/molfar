use std::io::Cursor;

pub(crate) fn decode_image(bytes: &[u8]) -> Result<image::DynamicImage, &'static str> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "image format detection failed")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|error| match error {
        image::ImageError::Limits(_) => "image exceeds decode limits",
        image::ImageError::Unsupported(_) => "unsupported image format",
        _ => "image decode failed",
    })
}
