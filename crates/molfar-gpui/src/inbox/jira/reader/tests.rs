use std::path::PathBuf;

use gpui::{AppContext, VisualTestContext, WindowOptions};
use molfar_core::jira::Issue;

use super::JiraReader;
use crate::inbox::jira::actions::DESCRIPTION_WARNING;

#[gpui::test]
fn jira_description_resolves_a_media_uuid_to_the_cached_attachment(cx: &mut gpui::TestAppContext) {
    let directory = std::env::temp_dir().join(format!("jira-media-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory).unwrap();
    let image = directory.join("101");
    image::DynamicImage::new_rgb8(1, 1)
        .save_with_format(&image, image::ImageFormat::Png)
        .unwrap();
    let issue = molfar_core::jira::issue::parse(
        &serde_json::json!({"key":"TB-1", "fields": {
            "description": {"type": "doc", "content": [
                {"type": "mediaSingle", "content": [{"type": "media", "attrs": {
                    "id": "10000000-0000-4000-8000-000000000001", "alt": "diagram.png"
                }}]}
            ]},
            "attachment": [{"id": "101", "filename": "diagram.png", "mimeType": "image/png"}]
        }}),
        None,
    );
    let preview = super::media::description_preview(&issue, &directory);
    assert!(
        matches!(&preview[..], [crate::knowledge::PreviewBlock::Image {
        path: Some(path), alt, ..
    }] if path.ends_with("101") && alt == "diagram.png")
    );
    assert!(issue.description.contains("attachment://10000000-0000"));

    let window = cx.update(|cx| {
        cx.open_window(WindowOptions::default(), |_, cx| {
            cx.new(|cx| {
                let mut reader = JiraReader::new(directory.clone(), cx);
                reader.issue = Some(issue);
                reader.media = directory.clone();
                reader.description = preview;
                reader
            })
        })
        .unwrap()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("knowledge-image-1").is_some());
    std::fs::remove_dir_all(&directory).unwrap();
}

#[test]
fn jira_description_handles_exact_ambiguous_and_unavailable_media() {
    use crate::knowledge::PreviewBlock;
    use molfar_core::jira::issue::Attachment;

    let picture = |id: &str, mime_type: &str| Attachment {
        id: id.into(),
        name: "diagram.png".into(),
        mime_type: mime_type.into(),
        ..Attachment::default()
    };
    let issue = Issue {
        description: concat!(
            "Before ![diagram.png](attachment://101) after.\n\n",
            "![diagram.png](attachment://10000000-0000-4000-8000-000000000001)\n\n",
            "```md\n![diagram.png](attachment://101)\n```"
        )
        .into(),
        attachments: vec![
            picture("101", "application/pdf"),
            picture("102", "image/png"),
        ],
        ..Issue::default()
    };
    let preview = super::media::description_preview(&issue, std::path::Path::new("/unused"));
    assert!(matches!(
        &preview[..],
        [PreviewBlock::Markdown(_), PreviewBlock::Image { path: None, alt, .. }, PreviewBlock::Markdown(_)]
            if alt == "diagram.png"
    ));
}

#[gpui::test]
fn cancel_sends_nothing_and_description_confirm_names_the_replacement(
    cx: &mut gpui::TestAppContext,
) {
    cx.update(|cx| {
        let reader = cx.new(|cx| JiraReader::new(PathBuf::from("/tmp/jira-reader"), cx));
        reader.update(cx, |reader, cx| {
            reader.issue = Some(Issue {
                key: "TB-1".into(),
                summary: "Ship".into(),
                description: "Body".into(),
                ..Issue::default()
            });
            let issue = reader.issue.clone().unwrap();
            reader.fill_fields(&issue, cx);
            reader.begin_edit(cx);
            assert!(
                !reader
                    .pending_prompt()
                    .unwrap()
                    .contains(DESCRIPTION_WARNING)
            );
            reader
                .description_input
                .update(cx, |input, cx| input.set_text("Replacement".into(), cx));
            reader.begin_edit(cx);
            let prompt = reader.pending_prompt().unwrap();
            assert!(prompt.contains("TB-1"));
            assert!(prompt.contains(DESCRIPTION_WARNING));
            reader.offline = true;
            reader.insert_issue(false, cx);
            assert_eq!(reader.error.as_deref(), Some("offline: Jira is offline"));
            reader.offline = false;
            reader.begin_comment("Ship it".into());
            reader.confirm(cx);
            assert!(reader.pending.is_none());
            assert!(reader.writing);
            reader.cancel();
            assert!(reader.pending.is_none());
            assert_eq!(reader.writes, 0);
            reader.finish_write(Ok(()), cx);
            assert!(reader.loading);
            assert_eq!(reader.writes, 1);
        });
    });
}
