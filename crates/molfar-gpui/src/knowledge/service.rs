use gpui::{Context, EventEmitter, Task};
use molfar_core::knowledge::{ConnectionState, NO_VAULT, VaultDocument, VaultHost, VaultSnapshot};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub(crate) enum Event {
    Changed,
}

pub(crate) struct VaultService {
    data_dir: PathBuf,
    pub(super) host: VaultHost,
    pub(super) state: ConnectionState,
    snapshot: Option<(VaultSnapshot, Instant)>,
    scanning: bool,
    generation: u64,
    waiters: Vec<async_channel::Sender<Result<VaultSnapshot, String>>>,
    error: Option<String>,
    loaded: bool,
    connecting: bool,
}

impl EventEmitter<Event> for VaultService {}

impl VaultService {
    pub(crate) fn new(data_dir: PathBuf, cx: &mut Context<Self>) -> Self {
        let host = VaultHost::new();
        let loader = host.clone();
        let directory = data_dir.clone();
        let load = cx
            .background_executor()
            .spawn(async move { loader.load(&directory) });
        cx.spawn(async move |this, cx| {
            let result = load.await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(state) => {
                        this.state = state;
                        this.error = None;
                    }
                    Err(error) => this.error = Some(error),
                }
                this.loaded = true;
                cx.emit(Event::Changed);
            });
        })
        .detach();
        Self {
            data_dir,
            host,
            state: ConnectionState::Empty,
            snapshot: None,
            scanning: false,
            generation: 0,
            waiters: Vec::new(),
            error: None,
            loaded: false,
            connecting: false,
        }
    }

    pub(crate) fn loaded(&self) -> bool {
        self.loaded
    }

    pub(crate) fn state(&self) -> &ConnectionState {
        &self.state
    }

    pub(crate) fn connecting(&self) -> bool {
        self.connecting
    }

    pub(crate) fn scanning(&self) -> bool {
        self.scanning
    }

    /// Notes indexed so far by the running scan.
    pub(crate) fn progress(&self) -> u64 {
        self.host.scan_progress()
    }

    pub(crate) fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    #[cfg(test)]
    pub(crate) fn scans_started(&self) -> u64 {
        self.host.scans_started()
    }

    pub(super) fn snapshot(
        &mut self,
        force: bool,
        cx: &mut Context<Self>,
    ) -> Task<Result<VaultSnapshot, String>> {
        if !matches!(self.state, ConnectionState::Ready(_)) {
            let error = match &self.state {
                ConnectionState::Broken(reason) => reason.clone(),
                _ => NO_VAULT.to_string(),
            };
            return Task::ready(Err(error));
        }
        if !force
            && let Some((snapshot, at)) = &self.snapshot
            && at.elapsed() < Duration::from_secs(60)
            && matches!(&self.state, ConnectionState::Ready(connection) if connection.id == snapshot.connection.id)
        {
            return Task::ready(Ok(snapshot.clone()));
        }
        let (sender, receiver) = async_channel::bounded(1);
        self.waiters.push(sender);
        if !self.scanning {
            self.start_scan(cx);
        }
        cx.spawn(async move |_, _| match receiver.recv().await {
            Ok(result) => result,
            Err(_) => Err("Vault scan cancelled.".into()),
        })
    }

    pub(crate) fn read_note(
        &self,
        path: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<VaultDocument, String>> {
        let host = self.host.clone();
        cx.background_executor()
            .spawn(async move { host.read(&path) })
    }

    pub(super) fn save_note(
        &mut self,
        path: String,
        body: String,
        revision: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<VaultDocument, String>> {
        let host = self.host.clone();
        let work = cx
            .background_executor()
            .spawn(async move { host.save(&path, &body, &revision) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            if result.is_ok() {
                let _ = this.update(cx, |this, cx| {
                    this.invalidate();
                    cx.emit(Event::Changed);
                });
            }
            result
        })
    }

    pub(crate) fn connect(&mut self, path: String, cx: &mut Context<Self>) {
        self.invalidate();
        self.connecting = true;
        cx.emit(Event::Changed);
        let host = self.host.clone();
        let directory = self.data_dir.clone();
        let work = cx
            .background_executor()
            .spawn(async move { host.connect(&directory, &path) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                this.connecting = false;
                // A scan started while connecting read the previous vault.
                this.invalidate();
                match result {
                    Ok(connection) => {
                        this.state = ConnectionState::Ready(connection);
                        this.error = None;
                    }
                    Err(error) => this.error = Some(error),
                }
                cx.emit(Event::Changed);
            });
        })
        .detach();
    }

    pub(crate) fn disconnect(&mut self, cx: &mut Context<Self>) {
        let _ = self.host.cancel();
        self.invalidate();
        let host = self.host.clone();
        let directory = self.data_dir.clone();
        let work = cx
            .background_executor()
            .spawn(async move { host.disconnect(&directory) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                match result {
                    Ok(()) => {
                        this.state = ConnectionState::Empty;
                        this.error = None;
                    }
                    Err(error) => this.error = Some(error),
                }
                cx.emit(Event::Changed);
            });
        })
        .detach();
    }

    fn start_scan(&mut self, cx: &mut Context<Self>) {
        self.scanning = true;
        cx.notify();
        let generation = self.generation;
        let host = self.host.clone();
        let work = cx.background_executor().spawn(async move { host.scan() });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
                if this.generation != generation {
                    return;
                }
                this.scanning = false;
                if let Ok(snapshot) = &result {
                    this.snapshot = Some((snapshot.clone(), Instant::now()));
                }
                for waiter in std::mem::take(&mut this.waiters) {
                    let _ = waiter.try_send(result.clone());
                }
                cx.notify();
            });
        })
        .detach();
    }

    fn invalidate(&mut self) {
        self.generation += 1;
        self.snapshot = None;
        self.scanning = false;
        for waiter in std::mem::take(&mut self.waiters) {
            let _ = waiter.try_send(Err("Vault scan cancelled.".into()));
        }
    }
}
