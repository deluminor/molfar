use super::*;

use std::path::Path;

use crate::test_support::tmp;

#[test]
fn only_video_containers_can_join_the_stream_scope() {
    use std::path::Path;
    assert!(is_streamable_video(Path::new("/clips/demo.MP4")));
    assert!(is_streamable_video(Path::new("/clips/demo.webm")));
    for path in [
        "/home/me/.ssh/id_rsa",
        "/notes/a.md",
        "/shot.png",
        "/mp4",
        "/a.mp4.txt",
    ] {
        assert!(!is_streamable_video(Path::new(path)), "{path}");
    }
}
#[test]
fn binary_reads_return_bytes_and_refuse_directories() {
    let dir = tmp("binary-read");
    let file = dir.0.join("shot.png");
    std::fs::write(&file, [0x89, b'P', b'N', b'G', 0x0d]).unwrap();

    let bytes = read_binary_file_sync(&file.to_string_lossy()).unwrap();
    assert_eq!(bytes, vec![0x89, b'P', b'N', b'G', 0x0d]);
    assert!(read_binary_file_sync(&dir.0.to_string_lossy()).is_err());
}

#[test]
fn project_images_read_only_inside_the_project() {
    let dir = tmp("project-image");
    let root = dir.0.join("repo");
    std::fs::create_dir_all(root.join(".github/readme")).unwrap();
    let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    std::fs::write(root.join(".github/readme/hero.png"), png).unwrap();
    std::fs::write(dir.0.join("secret.png"), b"secret").unwrap();

    let read = |path: &str| read_project_image_sync(&root, Path::new(path));
    assert_eq!(read(".github/readme/hero.png").unwrap(), png);
    assert_eq!(read("./.github/readme/hero.png").unwrap(), png);
    assert!(read("../secret.png").is_err());
    assert!(read(".github/../../secret.png").is_err());
    assert!(read(&dir.0.join("secret.png").to_string_lossy()).is_err());
    assert!(read(".github").is_err());
    assert!(read("").is_err());
    assert!(read("missing.png").is_err());
}

#[cfg(unix)]
#[test]
fn project_images_refuse_symlinks_out_of_the_project() {
    let dir = tmp("project-image-link");
    let root = dir.0.join("repo");
    std::fs::create_dir_all(root.join("docs")).unwrap();
    std::fs::write(dir.0.join("secret.png"), b"secret").unwrap();
    std::fs::write(root.join("docs/inside.png"), b"inside").unwrap();
    std::os::unix::fs::symlink(dir.0.join("secret.png"), root.join("leak.png")).unwrap();
    std::os::unix::fs::symlink(&dir.0, root.join("outside")).unwrap();
    std::os::unix::fs::symlink(root.join("docs/inside.png"), root.join("alias.png")).unwrap();

    let read = |path: &str| read_project_image_sync(&root, Path::new(path));
    assert!(read("leak.png").is_err());
    assert!(read("outside/secret.png").is_err());
    assert_eq!(read("alias.png").unwrap(), b"inside");
}

#[test]
fn project_images_refuse_oversized_files() {
    let dir = tmp("project-image-size");
    let file = std::fs::File::create(dir.0.join("huge.png")).unwrap();
    file.set_len(MAX_DOCUMENT_IMAGE_BYTES + 1).unwrap();
    let error = read_project_image_sync(&dir.0, Path::new("huge.png")).unwrap_err();
    assert!(error.contains("too large"), "{error}");
}
