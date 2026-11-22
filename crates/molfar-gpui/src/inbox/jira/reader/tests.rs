use std::path::PathBuf;

use gpui::AppContext;
use molfar_core::jira::Issue;

use super::JiraReader;
use crate::inbox::jira::actions::DESCRIPTION_WARNING;

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
