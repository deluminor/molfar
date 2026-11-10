use gpui::{Context, EventEmitter, Task};
use molfar_core::knowledge::{
    ConnectionState, NO_VAULT, NOT_IN_VAULT, VaultDocument, VaultHost, VaultSnapshot, shape_index,
    shape_note,
};
use serde_json::Value;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub(crate) enum Event {
    Changed,
}

pub(crate) struct VaultService {
    data_dir: PathBuf,
    host: VaultHost,
    state: ConnectionState,
    snapshot: Option<(VaultSnapshot, Instant)>,
    scanning: bool,
    generation: u64,
    waiters: Vec<async_channel::Sender<Result<VaultSnapshot, String>>>,
    error: Option<String>,
    loaded: bool,
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
        }
    }

    pub(crate) fn loaded(&self) -> bool {
        self.loaded
    }

    pub(crate) fn state(&self) -> &ConnectionState {
        &self.state
    }

    pub(crate) fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    #[cfg(test)]
    pub(crate) fn scans_started(&self) -> u64 {
        self.host.scans_started()
    }

    pub(crate) fn snapshot(
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

    pub(crate) fn save_note(
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
        let host = self.host.clone();
        let directory = self.data_dir.clone();
        let work = cx
            .background_executor()
            .spawn(async move { host.connect(&directory, &path) });
        cx.spawn(async move |this, cx| {
            let result = work.await;
            let _ = this.update(cx, |this, cx| {
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

    pub(crate) fn companion_index(
        &mut self,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if !matches!(self.state, ConnectionState::Ready(_)) {
            return Task::ready(Ok(molfar_core::knowledge::disconnected()));
        }
        let scan = self.snapshot(false, cx);
        cx.spawn(async move |_, _| Ok(shape_index(&scan.await?)))
    }

    pub(crate) fn companion_read(
        &mut self,
        path: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if let Some(error) = self.unavailable() {
            return Task::ready(Err(error));
        }
        let scan = self.snapshot(false, cx);
        let host = self.host.clone();
        cx.spawn(async move |this, cx| {
            let snapshot = scan.await?;
            if !snapshot.notes.iter().any(|note| note.path == path) {
                return Err(NOT_IN_VAULT.into());
            }
            let read = this
                .update(cx, |_, cx| {
                    let host = host.clone();
                    let path = path.clone();
                    cx.background_executor()
                        .spawn(async move { host.read(&path) })
                })
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            let document = read.await?;
            shape_note(&snapshot, &path, &document)
        })
    }

    pub(crate) fn companion_write(
        &mut self,
        path: String,
        body: String,
        revision: String,
        cx: &mut Context<Self>,
    ) -> Task<Result<Value, String>> {
        if let Some(error) = self.unavailable() {
            return Task::ready(Err(error));
        }
        let listed = self.snapshot(false, cx);
        cx.spawn(async move |this, cx| {
            let snapshot = listed.await?;
            if !snapshot.notes.iter().any(|note| note.path == path) {
                return Err(NOT_IN_VAULT.into());
            }
            let save = this
                .update(cx, |this, cx| {
                    this.save_note(path.clone(), body.clone(), revision.clone(), cx)
                })
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            let document = save.await?;
            let scan = this
                .update(cx, |this, cx| this.snapshot(true, cx))
                .map_err(|_| "Vault state is unavailable.".to_string())?;
            shape_note(&scan.await?, &path, &document)
        })
    }

    fn unavailable(&self) -> Option<String> {
        match &self.state {
            ConnectionState::Broken(reason) => Some(reason.clone()),
            ConnectionState::Empty => Some(NO_VAULT.into()),
            ConnectionState::Ready(_) => None,
        }
    }

    fn start_scan(&mut self, cx: &mut Context<Self>) {
        self.scanning = true;
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
