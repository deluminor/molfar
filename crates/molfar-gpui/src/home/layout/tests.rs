use super::{
    compact::{compact, move_to, resize_to},
    model::{COLUMNS, DEFAULT_LAYOUT, Item, WidgetId, default_item},
    state::{BrandVisual, LayoutState},
};
use serde_json::json;

fn no_overlaps(items: &[Item]) -> bool {
    items
        .iter()
        .enumerate()
        .all(|(index, item)| items[index + 1..].iter().all(|other| !item.overlaps(other)))
}

#[test]
fn default_layout_is_already_compact_and_in_bounds() {
    let compacted = compact(&DEFAULT_LAYOUT, None);

    assert_eq!(compacted, DEFAULT_LAYOUT.to_vec());
    assert!(no_overlaps(&compacted));
    assert!(compacted.iter().all(|item| item.x + item.w <= COLUMNS));
}

#[test]
fn hidden_widgets_leave_no_gap_and_keep_their_geometry() {
    let mut state = LayoutState::default();
    assert!(state.hide(WidgetId::Clock));
    assert!(state.hide(WidgetId::Status));
    assert!(state.hide(WidgetId::Activity));
    assert!(state.hide(WidgetId::Brand));

    let visible = state.visible();

    assert!(visible.iter().all(|item| !state.is_hidden(item.id)));
    assert_eq!(
        visible
            .iter()
            .find(|item| item.id == WidgetId::Inbox)
            .unwrap()
            .y,
        0
    );
    assert_eq!(
        state.items.iter().find(|item| item.id == WidgetId::Clock),
        Some(&default_item(WidgetId::Clock))
    );
}

#[test]
fn the_last_visible_widget_cannot_be_hidden() {
    let mut state = LayoutState::default();
    for id in &WidgetId::ALL[1..] {
        assert!(state.hide(*id));
    }

    assert!(!state.can_hide(WidgetId::Clock));
    assert!(!state.hide(WidgetId::Clock));
    state.show(WidgetId::Matrix);
    assert!(!state.is_hidden(WidgetId::Matrix));
}

#[test]
fn moving_pushes_colliding_cards_down_without_overlap() {
    let moved = move_to(&DEFAULT_LAYOUT, WidgetId::Matrix, 0, 0);

    let matrix = moved
        .iter()
        .find(|item| item.id == WidgetId::Matrix)
        .unwrap();
    assert_eq!((matrix.x, matrix.y), (0, 0));
    assert!(no_overlaps(&moved));
    assert!(
        moved
            .iter()
            .filter(|item| item.id != WidgetId::Matrix)
            .all(|item| item.y >= matrix.bottom())
    );
}

#[test]
fn moving_clamps_to_the_grid() {
    let moved = move_to(&DEFAULT_LAYOUT, WidgetId::Usage, 40, -3);

    let usage = moved
        .iter()
        .find(|item| item.id == WidgetId::Usage)
        .unwrap();
    assert_eq!(usage.x, COLUMNS - usage.w);
    assert_eq!(usage.y, 0);
    assert!(no_overlaps(&moved));
}

#[test]
fn resizing_respects_minimums_and_the_right_edge() {
    let shrunk = resize_to(&DEFAULT_LAYOUT, WidgetId::Host, 1, 1);
    let host = shrunk
        .iter()
        .find(|item| item.id == WidgetId::Host)
        .unwrap();
    assert_eq!((host.w, host.h), WidgetId::Host.min_size());

    let grown = resize_to(&DEFAULT_LAYOUT, WidgetId::Usage, 20, 9);
    let usage = grown
        .iter()
        .find(|item| item.id == WidgetId::Usage)
        .unwrap();
    assert_eq!((usage.w, usage.h), (COLUMNS - usage.x, 9));
    assert!(no_overlaps(&grown));
}

#[test]
fn narrow_layout_stacks_full_width_in_order() {
    let mut state = LayoutState::default();
    state.hide(WidgetId::Status);

    let narrow = state.narrow();

    assert_eq!(narrow[0].id, WidgetId::Clock);
    assert_eq!(narrow[1].id, WidgetId::Automations);
    assert!(narrow.iter().all(|item| item.x == 0 && item.w == COLUMNS));
    assert!(no_overlaps(&narrow));
}

#[test]
fn stored_state_round_trips() {
    let mut state = LayoutState::default();
    state.hide(WidgetId::Matrix);
    state.brand = BrandVisual::Sphere;
    state.apply(&move_to(&state.visible(), WidgetId::Usage, 0, 0));

    assert_eq!(LayoutState::parse(&state.to_value()), state);
}

#[test]
fn broken_storage_falls_back_per_widget() {
    let parsed = LayoutState::parse(&json!({
        "layout": [
            {"i": "usage", "x": 99, "y": -4, "w": 1, "h": 2.6},
            {"i": "nope", "x": 0, "y": 0, "w": 4, "h": 4},
            {"i": "host", "x": "left", "y": 0, "w": 4, "h": 4},
            "garbage"
        ],
        "hidden": ["clock", "unknown"],
        "brand": "laser"
    }));

    let usage = parsed
        .items
        .iter()
        .find(|item| item.id == WidgetId::Usage)
        .unwrap();
    assert_eq!((usage.x, usage.y, usage.w, usage.h), (COLUMNS - 3, 0, 3, 3));
    assert_eq!(
        parsed.items.iter().find(|item| item.id == WidgetId::Host),
        Some(&default_item(WidgetId::Host))
    );
    assert_eq!(parsed.hidden, [WidgetId::Clock]);
    assert_eq!(parsed.brand, BrandVisual::Sphere);
    assert_eq!(
        LayoutState::parse(&json!("corrupt")),
        LayoutState::default()
    );
}

#[test]
fn hiding_everything_in_storage_shows_everything() {
    let keys: Vec<&str> = WidgetId::ALL.iter().map(|id| id.key()).collect();

    let parsed = LayoutState::parse(&json!({ "hidden": keys }));

    assert!(parsed.hidden.is_empty());
}

#[test]
fn grid_geometry_maps_cells_to_pixels_and_back() {
    use super::geometry::Grid;
    use super::model::{GAP, ROW_HEIGHT};

    let width = 12. * 60. + 11. * GAP;
    let grid = Grid::new(width);
    let usage = default_item(WidgetId::Usage);

    let rect = grid.rect(&usage);

    assert_eq!(grid.column, 60.);
    assert_eq!(rect.x, 8. * (60. + GAP));
    assert_eq!(rect.y, 8. * (ROW_HEIGHT + GAP));
    assert_eq!(rect.w, 4. * 60. + 3. * GAP);
    assert_eq!(grid.cell(rect.x + 10., rect.y - 10.), (8, 8));
    assert_eq!(grid.span(rect.w, rect.h), (4, 4));
    assert_eq!(grid.height(&DEFAULT_LAYOUT), 21. * ROW_HEIGHT + 20. * GAP);
}

#[test]
fn legacy_brand_choices_migrate_to_sphere_without_changing_layout() {
    for brand in ["orb", "fire", "sphere", "unknown"] {
        let mut stored = LayoutState::default().to_value();
        stored["brand"] = json!(brand);
        let parsed = LayoutState::parse(&stored);
        assert_eq!(parsed.brand, BrandVisual::Sphere);
        assert_eq!(parsed.to_value()["brand"], "sphere");
        assert_eq!(parsed.items, LayoutState::default().items);
    }
}
