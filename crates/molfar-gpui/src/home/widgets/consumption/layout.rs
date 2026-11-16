use crate::home::widgets::Body;

pub(super) struct Geometry {
    pub wide: bool,
    pub chart_height: f32,
    pub list_height: f32,
}

impl Geometry {
    pub(super) fn new(body: Body) -> Self {
        let wide = body.w >= 720.;
        Self {
            wide,
            chart_height: (body.h - 90.).clamp(16., 140.),
            list_height: (body.h * 0.6).clamp(100., 300.),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn geometry_reserves_labels_and_uses_available_height() {
        for width in [240., 559., 720., 2800.] {
            for height in [100., 144., 300., 600.] {
                let geometry = Geometry::new(Body {
                    w: width,
                    h: height,
                });
                assert_eq!(geometry.wide, width >= 720.);
                assert!((16. ..=140.).contains(&geometry.chart_height));
                assert!((100. ..=300.).contains(&geometry.list_height));
            }
        }
    }
}
