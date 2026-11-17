//! Loopback Streamable HTTP listener. Every request authenticates again, so a
//! revoked or narrowed grant applies to the next call on any connection.
mod handler;
#[cfg(test)]
mod tests;

use super::{constants::MAX_BODY_BYTES, types::Principal};
use bytes::Bytes;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use hyper::{body::Incoming, header, Request, Response, StatusCode};
use rmcp::transport::streamable_http_server::{
    session::never::NeverSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use serde_json::Value;
use std::{convert::Infallible, net::SocketAddr, sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;

pub type Authenticate = Arc<dyn Fn(&str) -> Result<Option<Principal>, String> + Send + Sync>;

/// One validated, scope-checked tool call for the application to execute.
pub struct Call {
    pub principal: Principal,
    pub tool: &'static str,
    pub arguments: Value,
    pub reply: tokio::sync::oneshot::Sender<Result<Value, String>>,
}

pub struct Server {
    address: SocketAddr,
    cancel: CancellationToken,
    runtime: Option<tokio::runtime::Runtime>,
}

impl Server {
    /// Binds before returning, so a port conflict is reported to the caller
    /// instead of failing in the background.
    pub fn start(
        port: u16,
        authenticate: Authenticate,
    ) -> Result<(Self, async_channel::Receiver<Call>), String> {
        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
            .map_err(|error| format!("Cannot listen on 127.0.0.1:{port}: {error}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        let address = listener.local_addr().map_err(|error| error.to_string())?;
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("molfar-external-mcp")
            .enable_all()
            .build()
            .map_err(|error| error.to_string())?;
        let (calls, received) = async_channel::bounded(super::constants::MAX_QUEUED);
        let cancel = CancellationToken::new();
        let config = StreamableHttpServerConfig::default()
            .with_legacy_session_mode(false)
            .with_json_response(true)
            .with_sse_keep_alive(None)
            .with_max_request_body_bytes(MAX_BODY_BYTES)
            .with_allowed_hosts([
                format!("127.0.0.1:{}", address.port()),
                format!("localhost:{}", address.port()),
            ])
            .enforce_origin_validation()
            .with_cancellation_token(cancel.child_token());
        let handler = handler::Handler::new(calls);
        let service = Arc::new(StreamableHttpService::new(
            move || Ok(handler.clone()),
            Arc::new(NeverSessionManager::default()),
            config,
        ));
        let token = cancel.clone();
        let listener = {
            let _entered = runtime.enter();
            tokio::net::TcpListener::from_std(listener).map_err(|error| error.to_string())?
        };
        runtime.spawn(accept(listener, service, authenticate, token));

        Ok((
            Self {
                address,
                cancel,
                runtime: Some(runtime),
            },
            received,
        ))
    }

    pub fn address(&self) -> SocketAddr {
        self.address
    }
}

impl Drop for Server {
    /// Stops accepting and drops unfinished requests; work already handed to
    /// the application keeps running and keeps its receipts.
    fn drop(&mut self) {
        self.cancel.cancel();
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_timeout(Duration::from_secs(1));
        }
    }
}

type Service = Arc<StreamableHttpService<handler::Handler, NeverSessionManager>>;
type Reply = Response<BoxBody<Bytes, Infallible>>;

async fn accept(
    listener: tokio::net::TcpListener,
    service: Service,
    authenticate: Authenticate,
    cancel: CancellationToken,
) {
    loop {
        let stream = tokio::select! {
            () = cancel.cancelled() => return,
            accepted = listener.accept() => match accepted {
                Ok((stream, _)) => stream,
                Err(_) => continue,
            },
        };
        let service = service.clone();
        let authenticate = authenticate.clone();
        tokio::spawn(async move {
            let serve = hyper::service::service_fn(move |request| {
                let service = service.clone();
                let authenticate = authenticate.clone();
                async move { Ok::<_, Infallible>(route(request, &service, authenticate).await) }
            });
            let _ = hyper::server::conn::http1::Builder::new()
                .serve_connection(hyper_util::rt::TokioIo::new(stream), serve)
                .await;
        });
    }
}

async fn route(
    mut request: Request<Incoming>,
    service: &Service,
    authenticate: Authenticate,
) -> Reply {
    if request.uri().path() != "/mcp" {
        return plain(StatusCode::NOT_FOUND, "Not found");
    }
    let token = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_owned);
    let Some(token) = token else {
        return unauthorized();
    };
    let principal = tokio::task::spawn_blocking(move || authenticate(&token)).await;
    match principal {
        Ok(Ok(Some(principal))) => {
            request.extensions_mut().insert(principal);
            service.handle(request).await
        }
        Ok(Ok(None)) => unauthorized(),
        _ => plain(StatusCode::SERVICE_UNAVAILABLE, "Credential check failed"),
    }
}

fn unauthorized() -> Reply {
    let mut reply = plain(
        StatusCode::UNAUTHORIZED,
        "Missing, invalid or revoked credential",
    );
    reply.headers_mut().insert(
        header::WWW_AUTHENTICATE,
        header::HeaderValue::from_static("Bearer"),
    );
    reply
}

fn plain(status: StatusCode, text: &'static str) -> Reply {
    let mut reply = Response::new(Full::new(Bytes::from_static(text.as_bytes())).boxed());
    *reply.status_mut() = status;
    reply
}
