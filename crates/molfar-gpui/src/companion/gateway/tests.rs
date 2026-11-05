use super::*;

#[test]
fn recognizes_only_tailscale_addresses() {
    assert!(is_tailscale_v4(&Ipv4Addr::new(100, 64, 0, 1)));
    assert!(is_tailscale_v4(&Ipv4Addr::new(100, 127, 255, 254)));
    assert!(!is_tailscale_v4(&Ipv4Addr::new(100, 128, 0, 1)));
    assert!(!is_tailscale_v4(&Ipv4Addr::new(192, 168, 1, 10)));
}

#[test]
fn public_urls_must_be_https_or_tailnet_http() {
    assert_eq!(
        validate_public_url("https://mbp.tail1.ts.net/").unwrap(),
        "https://mbp.tail1.ts.net"
    );
    assert!(validate_public_url("http://100.101.1.2:3775").is_ok());
    assert!(validate_public_url("http://192.168.1.4:3775").is_err());
    assert!(validate_public_url("https://x.ts.net/?a=1").is_err());
}

#[test]
fn pair_codes_avoid_ambiguous_characters() {
    for _ in 0..40 {
        let code = new_pair_code();
        assert_eq!(code.len(), PAIR_CODE_LEN);
        assert!(code.bytes().all(|byte| PAIR_ALPHABET.contains(&byte)));
    }
    assert_eq!(normalize_code(" ab-cd 23 "), "ABCD23");
}

#[test]
fn pairing_stores_only_the_token_hash() {
    let dir = std::env::temp_dir().join(format!("molfar-companion-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let (host, _rx) = Host::open(dir.join("companion.json")).unwrap();
    {
        let mut inner = host.inner.lock().unwrap();
        inner.pairing = Some(Pairing {
            code: "ABCD2345".into(),
            expires_at: now_ms() + 60_000,
            attempts: 0,
        });
    }
    let reply = pair(
        &host,
        &json!({"code": "abcd-2345", "name": "Erik's iPhone"}),
    );
    assert_eq!(reply.status, 200);
    let token = reply.body["token"].as_str().unwrap().to_string();
    let stored = fs::read_to_string(dir.join("companion.json")).unwrap();
    assert!(!stored.contains(&token));
    assert!(stored.contains(&sha256_hex(&token)));
    host.shutdown();
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn a_device_revoked_by_the_desktop_app_stops_authenticating() {
    let dir = std::env::temp_dir().join(format!("molfar-companion-sync-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("companion.json");
    let (host, _) = Host::open(path.clone()).unwrap();
    let device = |id: &str, token: &str, last_seen_at: Option<u64>| Device {
        id: id.into(),
        name: id.into(),
        token_sha256: sha256_hex(token),
        created_at: 0,
        last_seen_at,
    };
    let (revoked, kept, added) = ("a".repeat(64), "b".repeat(64), "c".repeat(64));
    {
        let mut inner = host.inner.lock().unwrap();
        inner.stored.devices = vec![
            device("revoked", &revoked, None),
            device("kept", &kept, Some(50)),
        ];
        persist(&mut inner).unwrap();
    }

    std::thread::sleep(std::time::Duration::from_millis(20));
    let desktop = Stored {
        devices: vec![
            device("kept", &kept, Some(10)),
            device("added", &added, None),
        ],
        ..Stored::default()
    };
    fs::write(&path, serde_json::to_vec(&desktop).unwrap()).unwrap();

    assert_eq!(pairing::touch_seen(&host, &revoked), None);
    assert_eq!(pairing::touch_seen(&host, &added).as_deref(), Some("added"));
    {
        let inner = host.inner.lock().unwrap();
        let kept = inner
            .stored
            .devices
            .iter()
            .find(|device| device.id == "kept")
            .unwrap();
        assert_eq!(
            kept.last_seen_at,
            Some(50),
            "the newer local time must survive a reload"
        );
    }

    host.revoke("kept").unwrap();
    let saved: Stored = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    let ids: Vec<_> = saved
        .devices
        .iter()
        .map(|device| device.id.as_str())
        .collect();
    assert_eq!(
        ids,
        ["added"],
        "a local write must not restore revoked devices"
    );

    fs::write(&path, b"not json").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(20));
    assert_eq!(pairing::touch_seen(&host, &added).as_deref(), Some("added"));

    host.shutdown();
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn toggling_preserves_custom_connection_and_cached_discovery() {
    let dir =
        std::env::temp_dir().join(format!("molfar-companion-config-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("companion.json");
    let (host, _) = Host::open(path.clone()).unwrap();
    host.configure(
        false,
        BindMode::Tailnet,
        2444,
        Some("https://fixture.ts.net".into()),
    )
    .unwrap();
    let status = host.set_enabled(false, 2444).unwrap();
    assert_eq!(status.mode, BindMode::Tailnet);
    assert_eq!(status.port, 2444);
    assert_eq!(status.public_url.as_deref(), Some("https://fixture.ts.net"));
    assert!(host.set_enabled(false, 12).is_err());
    host.inner.lock().unwrap().discovery = crate::companion::discovery::Snapshot {
        ip: Some(Ipv4Addr::new(100, 64, 0, 1)),
        dns: Some("cached.ts.net".into()),
    };
    assert_eq!(
        host.status().unwrap().tailscale_dns.as_deref(),
        Some("cached.ts.net")
    );
    let clone = host.clone();
    assert!(Arc::ptr_eq(&host.sampler, &clone.sampler));
    host.shutdown();
    let stored = read_store(&path);
    assert_eq!(stored.mode, BindMode::Tailnet);
    assert_eq!(stored.port, 2444);
    fs::remove_dir_all(dir).unwrap();
}
