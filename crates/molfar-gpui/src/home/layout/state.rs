use super::{
    compact::compact,
    model::{COLUMNS, Item, NARROW_ORDER, WidgetId, default_item},
};
use serde_json::{Map, Value, json};

const MAX_ROWS: u16 = 48;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum BrandVisual {
    #[default]
    Sphere,
}

impl BrandVisual {
    pub(crate) fn key(self) -> &'static str {
        "sphere"
    }
}

/// Geometry for every widget, including hidden ones, plus what the owner hid.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct LayoutState {
    pub items: Vec<Item>,
    pub hidden: Vec<WidgetId>,
    pub brand: BrandVisual,
}

impl Default for LayoutState {
    fn default() -> Self {
        LayoutState {
            items: WidgetId::ALL.into_iter().map(default_item).collect(),
            hidden: Vec::new(),
            brand: BrandVisual::default(),
        }
    }
}

impl LayoutState {
    /// Accepts anything stored before; unknown or broken entries fall back to
    /// their defaults instead of discarding the whole arrangement.
    pub(crate) fn parse(value: &Value) -> LayoutState {
        let stored: Vec<Item> = value["layout"]
            .as_array()
            .map(|entries| entries.iter().filter_map(parse_item).collect())
            .unwrap_or_default();
        let items = WidgetId::ALL
            .into_iter()
            .map(|id| {
                stored
                    .iter()
                    .rev()
                    .find(|item| item.id == id)
                    .copied()
                    .unwrap_or_else(|| default_item(id))
            })
            .collect();

        let mut hidden: Vec<WidgetId> = WidgetId::ALL
            .into_iter()
            .filter(|id| {
                value["hidden"]
                    .as_array()
                    .is_some_and(|keys| keys.iter().any(|key| key.as_str() == Some(id.key())))
            })
            .collect();
        if hidden.len() == WidgetId::ALL.len() {
            hidden.clear();
        }

        let brand = BrandVisual::Sphere;

        LayoutState {
            items,
            hidden,
            brand,
        }
    }

    pub(crate) fn to_value(&self) -> Value {
        let layout: Vec<Value> = self
            .items
            .iter()
            .map(|item| json!({"i": item.id.key(), "x": item.x, "y": item.y, "w": item.w, "h": item.h}))
            .collect();
        let hidden: Vec<&str> = self.hidden.iter().map(|id| id.key()).collect();
        let mut object = Map::new();
        object.insert("layout".into(), layout.into());
        object.insert("hidden".into(), hidden.into());
        object.insert("brand".into(), self.brand.key().into());
        Value::Object(object)
    }

    pub(crate) fn is_hidden(&self, id: WidgetId) -> bool {
        self.hidden.contains(&id)
    }

    pub(crate) fn can_hide(&self, id: WidgetId) -> bool {
        !self.is_hidden(id) && WidgetId::ALL.len() - self.hidden.len() > 1
    }

    pub(crate) fn hide(&mut self, id: WidgetId) -> bool {
        if !self.can_hide(id) {
            return false;
        }
        self.hidden.push(id);
        true
    }

    pub(crate) fn show(&mut self, id: WidgetId) {
        self.hidden.retain(|hidden| *hidden != id);
    }

    /// Wide arrangement of the visible cards, floated up into the hidden gaps.
    pub(crate) fn visible(&self) -> Vec<Item> {
        let shown: Vec<Item> = self
            .items
            .iter()
            .filter(|item| !self.is_hidden(item.id))
            .copied()
            .collect();
        compact(&shown, None)
    }

    pub(crate) fn narrow(&self) -> Vec<Item> {
        let mut y = 0;
        NARROW_ORDER
            .into_iter()
            .filter(|(id, _)| !self.is_hidden(*id))
            .map(|(id, h)| {
                let item = Item {
                    id,
                    x: 0,
                    y,
                    w: COLUMNS,
                    h,
                };
                y += h;
                item
            })
            .collect()
    }

    /// Stores a visible arrangement back; hidden cards keep their geometry.
    pub(crate) fn apply(&mut self, visible: &[Item]) {
        for item in &mut self.items {
            if let Some(updated) = visible.iter().find(|entry| entry.id == item.id) {
                *item = *updated;
            }
        }
    }
}

fn parse_item(entry: &Value) -> Option<Item> {
    let id = WidgetId::parse(entry["i"].as_str()?)?;
    let number = |key: &str| entry[key].as_f64().filter(|value| value.is_finite());
    let (x, y, w, h) = (number("x")?, number("y")?, number("w")?, number("h")?);
    let (min_w, min_h) = id.min_size();
    let w = (w.round() as i64).clamp(i64::from(min_w), i64::from(COLUMNS)) as u16;
    let h = (h.round() as i64).clamp(i64::from(min_h), i64::from(MAX_ROWS)) as u16;
    let x = (x.round() as i64).clamp(0, i64::from(COLUMNS - w)) as u16;
    let y = (y.round() as i64).clamp(0, i64::from(MAX_ROWS) * 10) as u16;
    Some(Item { id, x, y, w, h })
}
