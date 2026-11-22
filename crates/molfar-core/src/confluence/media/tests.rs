use std::{cell::RefCell, collections::VecDeque, io::Cursor, path::Path};

use secrecy::{ExposeSecret, SecretString};
use serde_json::{json, Value};
use url::Url;

use crate::confluence::{
    cache::Cache,
    connector::Connector,
    error::ConfluenceError,
    http::{Client, Response, Transport},
};

const SITE: &str = "https://fixture.atlassian.net";
const LIST: &str = "/wiki/api/v2/pages/10/attachments?limit=50";
const DOWNLOAD: &str = "/wiki/download/attachments/10/diagram.png?api=v2";
const MEDIA: &str = "https://api.media.atlassian.com/file/media-id/binary?token=fixture-token";

type Step = (&'static str, Response);
struct Fixture(RefCell<VecDeque<Step>>);

impl Transport for Fixture {
    fn get(
        &self,
        url: &Url,
        authorization: Option<&SecretString>,
    ) -> Result<Response, ConfluenceError> {
        let (expected, response) = self.0.borrow_mut().pop_front().expect("unexpected request");
        assert_eq!(
            url.as_str(),
            Url::parse(SITE).unwrap().join(expected).unwrap().as_str()
        );
        let expected_auth = (!expected.starts_with("https://")).then_some("fixture-auth");
        assert_eq!(
            authorization.map(|secret| secret.expose_secret()),
            expected_auth
        );
        Ok(response)
    }
}

fn response(status: u16, location: Option<&str>, bytes: Vec<u8>) -> Response {
    Response {
        status,
        location: location.map(str::to_owned),
        bytes,
        retry_after: None,
        link: None,
    }
}

fn json_response(value: Value) -> Response {
    response(200, None, serde_json::to_vec(&value).unwrap())
}

fn attachments() -> Response {
    json_response(json!({"results":[{
        "id": "att1",
        "fileId": "media-id",
        "title": "diagram.png",
        "downloadLink": "/download/attachments/10/diagram.png?api=v2"
    }]}))
}

fn png() -> Response {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(1, 1)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    response(200, None, bytes.into_inner())
}

fn connector(root: &Path, steps: impl IntoIterator<Item = Step>) -> Connector<Fixture> {
    Connector {
        client: Client::new(
            Url::parse(SITE).unwrap(),
            "fixture-auth".into(),
            Fixture(RefCell::new(steps.into_iter().collect())),
        ),
        cache: Cache::new(Some(root), "fixture"),
    }
}

#[test]
fn confluence_attachment_redirect_resolves_an_adf_image_and_caches_its_png() {
    let dir = tempfile::tempdir().unwrap();
    let connector = connector(
        dir.path(),
        [
            (LIST, attachments()),
            (DOWNLOAD, response(302, Some(MEDIA), vec![])),
            (MEDIA, png()),
            (LIST, attachments()),
        ],
    );
    let document = crate::confluence::document::adf::parse(
        r#"{"type":"doc","content":[{"type":"mediaSingle","content":[{"type":"media","attrs":{"id":"media-id","alt":"diagram.png"}}]}]}"#,
    )
    .unwrap();

    let images = connector.images("/wiki/api/v2/pages/10", "10", 1, &document);
    let image = images.get("media-id").expect("ADF image must resolve");
    assert_eq!(image::open(image).unwrap().width(), 1);

    let storage = crate::confluence::document::storage::parse(
        r#"<ac:image><ri:attachment ri:filename="diagram.png" /></ac:image>"#,
    )
    .unwrap();
    let cached = connector.images("/wiki/api/v2/pages/10", "10", 1, &storage);
    assert_eq!(cached.get("diagram.png"), Some(image));
}

#[test]
fn confluence_refresh_retries_an_unavailable_storage_image() {
    let dir = tempfile::tempdir().unwrap();
    let page = || {
        json_response(json!({
            "title": "Guide",
            "version": {"number": 1},
            "body": {"storage": {"value": r#"<ac:image><ri:attachment ri:filename="diagram.png" /></ac:image>"#}}
        }))
    };
    let attachments = || {
        json_response(json!({"results": [{
            "id": "att1",
            "title": "diagram.png",
            "_links": {"download": "/download/attachments/10/diagram.png?api=v2"}
        }]}))
    };
    let connector = connector(
        dir.path(),
        [
            ("/wiki/api/v2/pages/10?body-format=atlas_doc_format", page()),
            (
                "/wiki/api/v2/pages/10/labels?limit=50",
                json_response(json!({"results": []})),
            ),
            (LIST, attachments()),
            (
                DOWNLOAD,
                response(302, Some("https://other.invalid/file"), vec![]),
            ),
            ("/wiki/api/v2/pages/10?body-format=atlas_doc_format", page()),
            (
                "/wiki/api/v2/pages/10/labels?limit=50",
                json_response(json!({"results": []})),
            ),
            (LIST, attachments()),
            (DOWNLOAD, response(302, Some(MEDIA), vec![])),
            (MEDIA, png()),
        ],
    );

    assert!(connector.page("10", false).unwrap().images.is_empty());
    let refreshed = connector.page("10", true).unwrap();
    assert!(refreshed.images["diagram.png"].is_file());
    assert_eq!(
        connector.cached_page("10").unwrap().images,
        refreshed.images,
    );
}
