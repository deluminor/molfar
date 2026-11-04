//! Home grid units and the factory arrangements, ported from home-layout.ts.

pub(crate) const COLUMNS: u16 = 12;
pub(crate) const ROW_HEIGHT: f32 = 40.;
pub(crate) const GAP: f32 = 12.;
/// Below this content width Home stacks its widgets and editing is off.
pub(crate) const EDIT_MIN_WIDTH: f32 = 768.;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum WidgetId {
    Clock,
    Status,
    Brand,
    Host,
    Usage,
    Inbox,
    Activity,
    Sessions,
    Automations,
    Matrix,
}

impl WidgetId {
    pub(crate) const ALL: [WidgetId; 10] = [
        WidgetId::Clock,
        WidgetId::Status,
        WidgetId::Brand,
        WidgetId::Host,
        WidgetId::Usage,
        WidgetId::Inbox,
        WidgetId::Activity,
        WidgetId::Sessions,
        WidgetId::Automations,
        WidgetId::Matrix,
    ];

    pub(crate) fn key(self) -> &'static str {
        match self {
            WidgetId::Clock => "clock",
            WidgetId::Status => "status",
            WidgetId::Brand => "brand",
            WidgetId::Host => "host",
            WidgetId::Usage => "usage",
            WidgetId::Inbox => "inbox",
            WidgetId::Activity => "activity",
            WidgetId::Sessions => "sessions",
            WidgetId::Automations => "automations",
            WidgetId::Matrix => "matrix",
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            WidgetId::Clock => "Clock",
            WidgetId::Status => "Status",
            WidgetId::Brand => "Brand",
            WidgetId::Host => "Host",
            WidgetId::Usage => "Usage",
            WidgetId::Inbox => "Inbox",
            WidgetId::Activity => "Activity",
            WidgetId::Sessions => "Sessions",
            WidgetId::Automations => "Automations",
            WidgetId::Matrix => "Matrix",
        }
    }

    pub(crate) fn parse(key: &str) -> Option<WidgetId> {
        WidgetId::ALL.into_iter().find(|id| id.key() == key)
    }

    pub(crate) fn min_size(self) -> (u16, u16) {
        match self {
            WidgetId::Clock | WidgetId::Status | WidgetId::Brand => (2, 3),
            WidgetId::Matrix => (4, 3),
            _ => (3, 3),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Item {
    pub id: WidgetId,
    pub x: u16,
    pub y: u16,
    pub w: u16,
    pub h: u16,
}

impl Item {
    const fn at(id: WidgetId, x: u16, y: u16, w: u16, h: u16) -> Item {
        Item { id, x, y, w, h }
    }

    pub(crate) fn overlaps(&self, other: &Item) -> bool {
        self.x < other.x + other.w
            && other.x < self.x + self.w
            && self.y < other.y + other.h
            && other.y < self.y + self.h
    }

    pub(crate) fn bottom(&self) -> u16 {
        self.y + self.h
    }
}

pub(crate) const DEFAULT_LAYOUT: [Item; 10] = [
    Item::at(WidgetId::Clock, 0, 0, 2, 4),
    Item::at(WidgetId::Status, 2, 0, 2, 4),
    Item::at(WidgetId::Brand, 10, 0, 2, 4),
    Item::at(WidgetId::Host, 0, 8, 8, 4),
    Item::at(WidgetId::Usage, 8, 8, 4, 4),
    Item::at(WidgetId::Inbox, 0, 4, 4, 4),
    Item::at(WidgetId::Activity, 4, 0, 6, 4),
    Item::at(WidgetId::Sessions, 4, 4, 4, 4),
    Item::at(WidgetId::Automations, 8, 4, 4, 4),
    Item::at(WidgetId::Matrix, 0, 12, 12, 7),
];

/// Narrow windows stack full-width cards in this order and these heights.
pub(crate) const NARROW_ORDER: [(WidgetId, u16); 10] = [
    (WidgetId::Clock, 4),
    (WidgetId::Status, 4),
    (WidgetId::Automations, 4),
    (WidgetId::Inbox, 4),
    (WidgetId::Brand, 8),
    (WidgetId::Host, 4),
    (WidgetId::Sessions, 4),
    (WidgetId::Activity, 4),
    (WidgetId::Usage, 4),
    (WidgetId::Matrix, 10),
];

pub(crate) fn default_item(id: WidgetId) -> Item {
    DEFAULT_LAYOUT
        .into_iter()
        .find(|item| item.id == id)
        .expect("every widget has a default")
}
