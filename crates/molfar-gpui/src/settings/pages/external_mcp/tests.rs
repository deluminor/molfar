use super::*;
use crate::settings::{ExternalClientRow, Section, layout_tests::window};
use gpui::{TestAppContext, VisualTestContext, WindowHandle};
use molfar_core::external_mcp::grants::types::GRANT;
use std::{cell::RefCell, rc::Rc};

fn show(cx: &mut TestAppContext, status: ExternalStatus) -> WindowHandle<SettingsView> {
    cx.update(crate::input::bind);
    let window = window(Section::Mcp, cx);
    window
        .update(cx, |view, _, cx| {
            view.ctx.external_mcp = Some(status);
            cx.notify();
        })
        .unwrap();
    window
}

fn click(visual: &mut VisualTestContext, selector: &'static str) {
    let bounds = visual
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("{selector}"));
    visual.simulate_click(bounds.center(), Default::default());
    visual.run_until_parked();
}

#[gpui::test]
fn external_mcp_add_submits_on_enter_and_escape_cancels(cx: &mut TestAppContext) {
    let window = show(
        cx,
        ExternalStatus {
            default_name: "Client 1".into(),
            ..Default::default()
        },
    );
    let events = Rc::new(RefCell::new(Vec::new()));
    let recorded = events.clone();
    let view = window.update(cx, |_, _, cx| cx.entity()).unwrap();
    cx.update(|cx| {
        cx.subscribe(&view, move |_, event: &SettingsEvent, _| {
            recorded.borrow_mut().push(event.clone());
        })
        .detach()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("external-status-Off").is_some());
    assert!(visual.debug_bounds("external-empty").is_some());

    click(visual, "external-mcp-add");
    visual.simulate_keystrokes("enter");
    assert!(
        matches!(events.borrow().as_slice(), [SettingsEvent::ExternalCreateClient { name }] if name == "Client 1")
    );
    window
        .update(visual, |view, _, cx| {
            view.external_edit_result(Err("A client already uses that name.".into()), cx);
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("external-edit-error").is_some());
    visual.simulate_keystrokes("escape");
    window
        .update(visual, |view, _, _| {
            assert!(view.external_page.editor.is_none());
        })
        .unwrap();
    assert_eq!(events.borrow().len(), 1);
}

#[gpui::test]
fn external_mcp_key_dismissal_revoke_confirmation_and_flags(cx: &mut TestAppContext) {
    let window = show(
        cx,
        ExternalStatus {
            enabled: true,
            port: 47821,
            endpoint: Some("http://127.0.0.1:47821/mcp".into()),
            clients: vec![ExternalClientRow {
                id: "client".into(),
                name: "Laptop".into(),
                grants: vec![],
                projects: vec![],
                resources_count: 0,
                created_at: 0,
            }],
            new_key: Some(("Laptop".into(), "fixture".into())),
            ..Default::default()
        },
    );
    let events = Rc::new(RefCell::new(Vec::new()));
    let recorded = events.clone();
    let view = window
        .update(cx, |view, _, cx| {
            view.ctx.projects = (0..10)
                .map(|index| (format!("/p/{index}"), format!("Project {index}")))
                .collect();
            cx.notify();
            cx.entity()
        })
        .unwrap();
    cx.update(|cx| {
        cx.subscribe(&view, move |view, event: &SettingsEvent, cx| {
            recorded.borrow_mut().push(event.clone());
            if matches!(event, SettingsEvent::ExternalDismissKey) {
                view.update(cx, |view, cx| {
                    view.ctx.external_mcp.as_mut().unwrap().new_key = None;
                    cx.notify();
                });
            }
        })
        .detach()
    });
    let visual = &mut VisualTestContext::from_window(window.into(), cx);
    visual.run_until_parked();
    assert!(visual.debug_bounds("external-status-Listening").is_some());
    click(visual, "external-mcp-key-done");
    assert!(visual.debug_bounds("external-mcp-key-done").is_none());
    click(visual, "external-revoke");
    assert_eq!(events.borrow().len(), 1);
    click(visual, "external-revoke-confirm");
    assert!(
        matches!(events.borrow().last(), Some(SettingsEvent::ExternalRevoke(id)) if id == "client")
    );

    assert!(visual.debug_bounds("external-projects-collapsed").is_some());
    let flag = visual.debug_bounds("external-grant-destructive").unwrap();
    window
        .update(visual, |view, _, cx| {
            let offset = view.scroll.offset();
            let viewport = view.scroll.bounds();
            view.scroll.set_offset(gpui::point(
                offset.x,
                offset.y + viewport.center().y - flag.center().y,
            ));
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    click(visual, "external-grant-destructive");
    assert!(matches!(
        events.borrow().last(),
        Some(SettingsEvent::ExternalToggleGrant {
            grant: Some(GRANT::Destructive),
            ..
        })
    ));
    window
        .update(visual, |view, _, cx| {
            let status = view.ctx.external_mcp.as_mut().unwrap();
            status.endpoint = None;
            status.error = Some("Port unavailable".into());
            cx.notify();
        })
        .unwrap();
    visual.run_until_parked();
    assert!(visual.debug_bounds("external-status-Error").is_some());
}

#[test]
fn permission_hints_follow_tools_in_the_catalog() {
    use super::permissions::grant_tools;
    use molfar_core::external_mcp::grants::types::DOMAIN;

    assert_eq!(grant_tools(GRANT::BoardRun), 7);
    assert_eq!(grant_tools(GRANT::Destructive), 2);
    assert_eq!(grant_tools(GRANT::Read(DOMAIN::Notes)), 2);
    assert_eq!(grant_tools(GRANT::Write(DOMAIN::Notes)), 3);
    assert_eq!(grant_tools(GRANT::Write(DOMAIN::Sessions)), 6);
    assert_eq!(grant_tools(GRANT::Delegated), 0);
}
