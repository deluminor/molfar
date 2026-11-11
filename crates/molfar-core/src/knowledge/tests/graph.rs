use super::super::*;
use std::sync::atomic::AtomicBool;

fn note(path: &str, links: &[&str]) -> VaultNote {
    VaultNote {
        path: path.into(),
        title: path
            .trim_end_matches(".md")
            .rsplit('/')
            .next()
            .unwrap()
            .into(),
        aliases: Vec::new(),
        tags: Vec::new(),
        links: links
            .iter()
            .map(|target| VaultLink {
                target: (*target).into(),
                kind: "wiki".into(),
            })
            .collect(),
    }
}

fn vault() -> Vec<VaultNote> {
    vec![
        note("Home.md", &["Work/Plan", "Health/Sport", "Ghost"]),
        note("Work/Plan.md", &["Home"]),
        note("Health/Sport.md", &[]),
        note("Lonely.md", &[]),
    ]
}

#[test]
fn projection_dedupes_undirected_links_and_counts_stats() {
    let graph = project_graph(&vault(), None, "", false);
    assert_eq!(graph.nodes.len(), 4);
    assert_eq!(graph.edges.len(), 2);
    assert_eq!(graph.links, 2);
    assert_eq!(graph.orphans, 1);
    assert_eq!(graph.missing, 1);
    assert_eq!(graph.nodes[0].path, "Home.md");
    assert_eq!(graph.nodes[0].degree, 2);
    let sport = graph.index_of("Health/Sport.md").unwrap();
    assert_eq!(graph.nodes[sport].group, "Health");
    assert_eq!(graph.nodes[graph.index_of("Lonely.md").unwrap()].group, "");
}

#[test]
fn neighborhood_keeps_the_selection_and_its_direct_links() {
    let graph = project_graph(&vault(), Some("Work/Plan.md"), "", true);
    let paths: Vec<_> = graph.nodes.iter().map(|node| node.path.as_str()).collect();
    assert_eq!(paths, ["Work/Plan.md", "Home.md"]);
    assert_eq!(graph.edges.len(), 1);
    assert_eq!(graph.neighbors(0).into_iter().collect::<Vec<_>>(), [1]);
}

#[test]
fn query_filters_by_title_path_alias_and_tag() {
    let mut notes = vault();
    notes[3].tags.push("solitude".into());
    assert_eq!(project_graph(&notes, None, "SOLI", false).nodes.len(), 1);
    assert_eq!(project_graph(&notes, None, "health/", false).total, 1);
    assert!(project_graph(&notes, None, "nothing-here", false)
        .nodes
        .is_empty());
}

#[test]
fn layout_is_deterministic_finite_and_keeps_linked_nodes_closer() {
    let graph = project_graph(&vault(), None, "", false);
    let first = settle(
        graph.nodes.len(),
        &graph.edges,
        &[],
        SETTLE_TICKS,
        &AtomicBool::new(false),
    )
    .unwrap();
    let second = settle(
        graph.nodes.len(),
        &graph.edges,
        &[],
        SETTLE_TICKS,
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(first, second);
    assert!(first.iter().flatten().all(|value| value.is_finite()));
    let distance = |a: usize, b: usize| {
        (0..3)
            .map(|axis| (first[a][axis] - first[b][axis]).powi(2))
            .sum::<f32>()
            .sqrt()
    };
    let home = graph.index_of("Home.md").unwrap();
    let plan = graph.index_of("Work/Plan.md").unwrap();
    let lonely = graph.index_of("Lonely.md").unwrap();
    assert!(distance(home, plan) < distance(home, lonely));
}

#[test]
fn layout_warm_starts_from_previous_positions() {
    let previous = vec![Some([100., 10., 0.]), Some([-100., 10., 0.]), None];
    let positions = settle(3, &[], &previous, 0, &AtomicBool::new(false)).unwrap();
    assert_eq!(positions.len(), 3);
    assert!((positions[0][0] - positions[1][0] - 200.).abs() < 0.01);
    assert_eq!(positions[0][1], positions[1][1]);
}

#[test]
fn camera_projects_the_origin_to_the_centre_and_fits_points() {
    let camera = Camera::default();
    let centre = camera.project([0., 0., 0.], 800., 600.).unwrap();
    assert!((centre.x - 400.).abs() < 0.01 && (centre.y - 300.).abs() < 0.01);
    let points = [[100., 0., 0.], [-100., 50., 0.]];
    let fitted = Camera {
        distance: Camera::fit_distance(&points, 800., 600.),
        ..camera
    };
    for point in points {
        let projected = fitted.project(point, 800., 600.).unwrap();
        assert!((0. ..=800.).contains(&projected.x));
        assert!((0. ..=600.).contains(&projected.y));
    }
    let behind = Camera {
        distance: 50.,
        ..camera
    };
    assert!(
        behind.project([0., 0., 400.], 800., 600.).is_none()
            || behind.project([0., 0., -400.], 800., 600.).is_none()
    );
}

#[test]
fn camera_clamps_pitch_and_cancelled_layouts_stop() {
    let mut camera = Camera::default();
    camera.orbit(0., 10.);
    assert!(camera.pitch < 1.5);
    assert!(
        settle(2, &[], &[], 10, &AtomicBool::new(true)).is_none(),
        "a cancelled layout stops"
    );
}

#[test]
fn pick_prefers_the_node_nearest_the_eye() {
    let near = Projected {
        x: 10.,
        y: 10.,
        depth: 100.,
        scale: 1.,
    };
    let far = Projected {
        x: 12.,
        y: 10.,
        depth: 300.,
        scale: 1.,
    };
    assert_eq!(
        pick(&[Some(far), Some(near), None], &[8., 8., 8.], 11., 10.),
        Some(1)
    );
    assert_eq!(pick(&[Some(near)], &[8.], 100., 100.), None);
}

#[test]
fn unproject_inverts_project() {
    let camera = Camera {
        yaw: 0.7,
        pitch: -0.4,
        distance: 500.,
    };
    let point = [35., -20., 60.];
    let projected = camera.project(point, 900., 600.).unwrap();
    let back = camera.unproject(projected.x, projected.y, projected.depth, 900., 600.);
    for axis in 0..3 {
        assert!((back[axis] - point[axis]).abs() < 0.01, "{back:?}");
    }
}

#[test]
fn a_pinned_node_pulls_its_links_along_and_the_simulation_cools() {
    let edges = [GraphEdge {
        source: 0,
        target: 1,
    }];
    let start = [
        Some([0., 0., 0.]),
        Some([30., 0., 0.]),
        Some([-200., 0., 0.]),
    ];
    let mut simulation = Simulation::new(3, &edges, &start);
    simulation.reheat(DRAG_ALPHA);
    for _ in 0..60 {
        simulation.tick(Some((0, [300., 0., 0.])));
    }
    let positions = simulation.positions();
    assert_eq!(positions[0], [300., 0., 0.]);
    assert!(
        positions[1][0] > 150.,
        "the linked note follows: {positions:?}"
    );
    for _ in 0..400 {
        simulation.tick(None);
    }
    assert!(simulation.settled());
}
