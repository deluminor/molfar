//! The native 3D knowledge graph. Layout settles off the UI thread; frames
//! only ease positions, orbit the camera and project.
use gpui::{Bounds, Context, EventEmitter, Pixels, Task};
use molfar_core::knowledge::{
    Camera, GraphProjection, Point3, Projected, SETTLE_TICKS, Simulation, WARM_TICKS, settle,
};
use std::{
    cell::Cell,
    collections::HashMap,
    rc::Rc,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

mod frame;
mod input;
mod overlay;
mod paint;
mod view;

/// How long nodes glide to a new layout.
const TRANSITION: Duration = Duration::from_millis(900);
/// Radians per second of idle rotation.
const SPIN: f32 = 0.09;

pub(crate) enum GraphEvent {
    Select(String),
    ToggleNeighborhood,
}

enum Drag {
    /// Empty space: orbit the camera.
    Orbit {
        last: gpui::Point<Pixels>,
        travel: f32,
    },
    /// A note: pin it under the cursor at its depth; its links follow.
    Node {
        index: usize,
        depth: f32,
        origin: gpui::Point<Pixels>,
        target: Option<Point3>,
        travel: f32,
    },
}

impl Drag {
    fn travel(&self) -> f32 {
        match self {
            Self::Orbit { travel, .. } | Self::Node { travel, .. } => *travel,
        }
    }
}

pub(crate) struct GraphView {
    shown: Arc<GraphProjection>,
    pending: Option<Arc<GraphProjection>>,
    simulation: Option<Simulation>,
    positions: Vec<Point3>,
    from: Vec<Point3>,
    transition: Option<Instant>,
    camera: Camera,
    target_distance: f32,
    fit_pending: bool,
    spinning: bool,
    neighbors_only: bool,
    hovered: Option<usize>,
    selected: Option<String>,
    drag: Option<Drag>,
    bounds: Rc<Cell<Bounds<Pixels>>>,
    projected: Vec<Option<Projected>>,
    radii: Vec<f32>,
    last_frame: Option<Instant>,
    generation: u64,
    cancel: Arc<AtomicBool>,
    _layout: Option<Task<()>>,
}

impl EventEmitter<GraphEvent> for GraphView {}

fn ease(t: f32) -> f32 {
    1. - (1. - t.clamp(0., 1.)).powi(3)
}

impl GraphView {
    pub(crate) fn new() -> Self {
        Self {
            shown: Arc::default(),
            pending: None,
            simulation: None,
            positions: Vec::new(),
            from: Vec::new(),
            transition: None,
            camera: Camera::default(),
            target_distance: Camera::default().distance,
            fit_pending: true,
            spinning: true,
            neighbors_only: false,
            hovered: None,
            selected: None,
            drag: None,
            bounds: Rc::default(),
            projected: Vec::new(),
            radii: Vec::new(),
            last_frame: None,
            generation: 0,
            cancel: Arc::default(),
            _layout: None,
        }
    }

    pub(crate) fn set_selected(&mut self, path: Option<String>, cx: &mut Context<Self>) {
        if self.selected != path {
            self.selected = path;
            cx.notify();
        }
    }

    pub(crate) fn set_neighbors_only(&mut self, value: bool, cx: &mut Context<Self>) {
        self.neighbors_only = value;
        cx.notify();
    }

    pub(crate) fn set_projection(&mut self, projection: GraphProjection, cx: &mut Context<Self>) {
        let target = self.pending.as_deref().unwrap_or(&self.shown);
        let same_shape = target.edges == projection.edges
            && target.nodes.len() == projection.nodes.len()
            && target
                .nodes
                .iter()
                .zip(&projection.nodes)
                .all(|(left, right)| left.path == right.path);
        if same_shape && self.pending.is_none() {
            self.shown = Arc::new(projection);
            cx.notify();
            return;
        }

        let current = self.current_positions(Instant::now());
        let placed: HashMap<&str, Point3> = self
            .shown
            .nodes
            .iter()
            .zip(&current)
            .map(|(node, point)| (node.path.as_str(), *point))
            .collect();
        let previous: Vec<Option<Point3>> = projection
            .nodes
            .iter()
            .map(|node| placed.get(node.path.as_str()).copied())
            .collect();
        let warm = previous.iter().any(Option::is_some);
        let edges = projection.edges.clone();
        let count = projection.nodes.len();
        let projection = Arc::new(projection);
        self.pending = Some(projection.clone());
        self.generation += 1;
        let generation = self.generation;

        let ticks = if warm { WARM_TICKS } else { SETTLE_TICKS };
        let seeds = previous.clone();
        self.cancel.store(true, Ordering::Relaxed);
        self.cancel = Arc::default();
        let cancel = self.cancel.clone();
        let work = cx
            .background_executor()
            .spawn(async move { settle(count, &edges, &seeds, ticks, &cancel) });
        self._layout = Some(cx.spawn(async move |this, cx| {
            let Some(positions) = work.await else {
                return;
            };
            let _ = this.update(cx, |this, cx| {
                if this.generation != generation {
                    return;
                }
                this.finish_layout(projection, positions, &previous, cx);
            });
        }));
        cx.notify();
    }

    fn finish_layout(
        &mut self,
        projection: Arc<GraphProjection>,
        positions: Vec<Point3>,
        previous: &[Option<Point3>],
        cx: &mut Context<Self>,
    ) {
        let first = self.shown.nodes.is_empty();
        self.from = positions
            .iter()
            .zip(previous)
            .map(|(target, previous)| {
                previous.unwrap_or([target[0] * 0.05, target[1] * 0.05, target[2] * 0.05])
            })
            .collect();
        self.positions = positions;
        self.transition = Some(Instant::now());
        self.simulation = Some(Simulation::new(
            self.positions.len(),
            &projection.edges,
            &self.positions.iter().copied().map(Some).collect::<Vec<_>>(),
        ));
        self.shown = projection;
        self.pending = None;
        self.hovered = None;
        self.fit_pending |= first;
        cx.notify();
    }

    fn current_positions(&self, now: Instant) -> Vec<Point3> {
        let Some(started) = self.transition else {
            return self.positions.clone();
        };
        let t = ease(now.duration_since(started).as_secs_f32() / TRANSITION.as_secs_f32());
        self.positions
            .iter()
            .zip(&self.from)
            .map(|(to, from)| {
                [
                    from[0] + (to[0] - from[0]) * t,
                    from[1] + (to[1] - from[1]) * t,
                    from[2] + (to[2] - from[2]) * t,
                ]
            })
            .collect()
    }

    /// Ends a layout glide where it is, so a drag starts from what is shown.
    fn settle_transition(&mut self) {
        if self.transition.is_none() {
            return;
        }
        self.positions = self.current_positions(Instant::now());
        self.transition = None;
        let placed: Vec<Option<Point3>> = self.positions.iter().copied().map(Some).collect();
        self.simulation = Some(Simulation::new(placed.len(), &self.shown.edges, &placed));
    }

    /// Ticks the live simulation, pinning a dragged note under the cursor.
    fn step_simulation(&mut self) {
        let pinned = match &self.drag {
            Some(Drag::Node {
                index,
                target: Some(target),
                ..
            }) => Some((*index, *target)),
            _ => None,
        };
        let Some(simulation) = self.simulation.as_mut() else {
            return;
        };
        if pinned.is_none() && simulation.settled() {
            return;
        }
        simulation.tick(pinned);
        self.positions = simulation.positions().to_vec();
    }

    fn simulating(&self) -> bool {
        matches!(
            self.drag,
            Some(Drag::Node {
                target: Some(_),
                ..
            })
        ) || self
            .simulation
            .as_ref()
            .is_some_and(|simulation| !simulation.settled())
    }

    pub(crate) fn fit(&mut self, cx: &mut Context<Self>) {
        self.fit_pending = true;
        cx.notify();
    }

    #[cfg(test)]
    pub(crate) fn shown_paths(&self) -> Vec<String> {
        self.shown
            .nodes
            .iter()
            .map(|node| node.path.clone())
            .collect()
    }

    #[cfg(test)]
    pub(crate) fn selected_path(&self) -> Option<&str> {
        self.selected.as_deref()
    }

    fn selected_index(&self) -> Option<usize> {
        self.shown.index_of(self.selected.as_deref()?)
    }
}

#[cfg(test)]
mod tests;
