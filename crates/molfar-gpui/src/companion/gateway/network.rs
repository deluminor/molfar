use super::*;

pub(super) fn status_of(inner: &Inner) -> Status {
    let addr = inner.running.as_ref().map(|running| running.addr);
    Status {
        enabled: inner.stored.enabled,
        running: addr.is_some(),
        mode: inner.stored.mode,
        port: inner.stored.port,
        public_url: inner.stored.public_url.clone(),
        effective_url: effective_url(&inner.stored, addr, &inner.discovery),
        listen_addr: addr.map(|addr| addr.to_string()),
        error: inner.error.clone(),
        tailscale_ip: inner.discovery.ip.map(|ip| ip.to_string()),
        tailscale_dns: inner.discovery.dns.clone(),
        devices: inner
            .stored
            .devices
            .iter()
            .map(|device| DeviceInfo {
                id: device.id.clone(),
                name: device.name.clone(),
                created_at: device.created_at,
                last_seen_at: device.last_seen_at,
            })
            .collect(),
    }
}

pub(super) fn bind_addr(stored: &Stored) -> Result<SocketAddr, String> {
    let ip = match stored.mode {
        BindMode::Serve => IpAddr::V4(Ipv4Addr::LOCALHOST),
        BindMode::Tailnet => {
            IpAddr::V4(tailscale_ip().ok_or("Tailscale is not connected on this computer")?)
        }
    };
    Ok(SocketAddr::new(ip, stored.port))
}

pub(super) fn effective_url(
    stored: &Stored,
    addr: Option<SocketAddr>,
    discovery: &crate::companion::discovery::Snapshot,
) -> Option<String> {
    if let Some(url) = stored.public_url.as_ref().filter(|url| !url.is_empty()) {
        return Some(url.clone());
    }
    match stored.mode {
        BindMode::Serve => discovery.dns.as_ref().map(|name| format!("https://{name}")),
        BindMode::Tailnet => addr
            .map(|addr| addr.ip())
            .or_else(|| discovery.ip.map(IpAddr::V4))
            .map(|ip| format!("http://{ip}:{}", stored.port)),
    }
}

pub(super) fn validate_public_url(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| "Public URL is not a valid URL")?;
    match parsed.scheme() {
        "https" => {}
        "http"
            if parsed.host_str().is_some_and(|host| {
                host.parse::<Ipv4Addr>()
                    .is_ok_and(|ip| is_tailscale_v4(&ip))
            }) => {}
        _ => return Err("Use an https:// URL, or http:// with a Tailscale 100.x address".into()),
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Public URL must not have a query or fragment".into());
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

pub(super) fn is_tailscale_v4(ip: &Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 100 && (64..128).contains(&b)
}

pub(in crate::companion) fn tailscale_ip() -> Option<Ipv4Addr> {
    get_if_addrs()
        .ok()?
        .into_iter()
        .find_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if is_tailscale_v4(&ip) => Some(ip),
            _ => None,
        })
}
