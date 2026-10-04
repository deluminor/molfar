import { useCallback, useEffect, useRef, useState } from "react";
import { readVaultNote, saveVaultNote } from "../../model/vault/vault-client";
import type { VaultDocument, VaultSnapshot } from "../../model/vault/types";
import type { NoteDraft } from "./types";
import { readDrafts, retainDrafts } from "./draft-store";
import {
  detectLineEnding,
  normalizeLineBreaks,
  restoreLineEnding,
} from "@/features/files/editor/editor-doc";

export function useVaultDocument(
  vaultId: string | undefined,
  path: string | null,
  root: string | undefined,
  onSaved: () => Promise<void>,
  refreshToken?: VaultSnapshot | null,
) {
  const [drafts, setDrafts] = useState<Record<string, NoteDraft>>(() =>
    readDrafts(root),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const saveEpoch = useRef(0);
  const latestDrafts = useRef(drafts);
  latestDrafts.current = drafts;
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const draft = path ? drafts[path] : undefined;

  useEffect(() => {
    generation.current += 1;
    setDrafts(readDrafts(root));
    setError(null);
  }, [vaultId, root]);

  useEffect(() => {
    if (root) retainDrafts(root, drafts);
  }, [root, drafts]);

  useEffect(() => {
    setLoading(false);
    if (!vaultId || !path || drafts[path]) return;
    setError(null);
    let alive = true;
    setLoading(true);
    void readVaultNote(vaultId, path)
      .then((saved) => {
        if (alive)
          setDrafts((current) => ({
            ...current,
            [path]: { saved, body: saved.body, conflict: false },
          }));
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [vaultId, path, drafts]);

  useEffect(() => {
    if (!vaultId || !path || !latestDrafts.current[path]) return;
    let alive = true;
    const epoch = saveEpoch.current;
    void readVaultNote(vaultId, path)
      .then((saved) => {
        if (!alive || epoch !== saveEpoch.current || inFlight.current) return;
        const selectedDraft = latestDrafts.current[path];
        if (
          selectedDraft &&
          selectedDraft.saved.revision !== saved.revision &&
          selectedDraft.body !== selectedDraft.saved.body
        )
          setError(
            "This note changed in your vault. Your draft is kept; load the current revision before saving.",
          );
        setDrafts((current) => {
          const selected = current[path];
          if (!selected || selected.saved.revision === saved.revision)
            return current;
          if (selected.body !== selected.saved.body) {
            return { ...current, [path]: { ...selected, conflict: true } };
          }
          return {
            ...current,
            [path]: { saved, body: saved.body, conflict: false },
          };
        });
      })
      .catch((failure: unknown) => {
        if (alive) setError(String(failure));
      });
    return () => {
      alive = false;
    };
  }, [vaultId, path, refreshToken]);

  const contextDocument = useCallback(async (): Promise<VaultDocument> => {
    if (!vaultId || !path) throw new Error("Select a saved note first.");
    const selected = latestDrafts.current[path];
    if (!selected || selected.conflict || selected.body !== selected.saved.body)
      throw new Error(
        "Save or resolve your draft before adding agent context.",
      );
    const currentGeneration = generation.current;
    const saved = await readVaultNote(vaultId, path);
    const current = latestDrafts.current[path];
    if (
      currentGeneration !== generation.current ||
      !current ||
      current.conflict ||
      current.body !== current.saved.body
    )
      throw new Error(
        "The selected draft changed while loading context. Try again.",
      );
    setDrafts((values) => ({
      ...values,
      [path]: { saved, body: saved.body, conflict: false },
    }));
    return saved;
  }, [vaultId, path]);

  const clear = useCallback(() => {
    if (root) retainDrafts(root, {});
    setDrafts({});
    latestDrafts.current = {};
  }, [root]);

  const change = useCallback(
    (body: string) => {
      if (!path) return;
      setDrafts((current) => {
        const selected = current[path];
        if (!selected) return current;
        const content = restoreLineEnding(
          normalizeLineBreaks(body),
          detectLineEnding(selected.saved.body),
        );

        return { ...current, [path]: { ...selected, body: content } };
      });
    },
    [path],
  );

  const save = useCallback(async () => {
    if (!vaultId || !path || !draft || draft.conflict || inFlight.current)
      return;
    inFlight.current = true;
    saveEpoch.current += 1;
    setSaving(true);
    setError(null);
    const currentGeneration = generation.current;
    try {
      const saved = await saveVaultNote(
        vaultId,
        path,
        draft.body,
        draft.saved.revision,
      );
      if (generation.current !== currentGeneration) return;
      setDrafts((current) => {
        const selected = current[path];
        if (!selected) return current;
        return { ...current, [path]: { ...selected, saved, conflict: false } };
      });
      await onSaved();
    } catch (failure: unknown) {
      if (generation.current !== currentGeneration) return;
      setError(String(failure));
      setDrafts((current) => {
        const selected = current[path];
        if (!selected) return current;
        return { ...current, [path]: { ...selected, conflict: true } };
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [vaultId, path, draft, onSaved]);

  const reload = useCallback(async () => {
    if (!vaultId || !path) return;
    const currentGeneration = generation.current;
    try {
      const saved = await readVaultNote(vaultId, path);
      if (generation.current !== currentGeneration) return;
      setDrafts((current) => {
        const selected = current[path];
        if (!selected) return current;
        return { ...current, [path]: { ...selected, saved, conflict: false } };
      });
      setError(null);
    } catch (failure: unknown) {
      setError(String(failure));
    }
  }, [vaultId, path]);

  const discard = useCallback(() => {
    if (!path) return;
    setDrafts((current) => {
      const selected = current[path];
      if (!selected) return current;
      return {
        ...current,
        [path]: { ...selected, body: selected.saved.body, conflict: false },
      };
    });
    setError(null);
  }, [path]);

  const dirty = Boolean(draft && draft.body !== draft.saved.body);
  const hasDirty = Object.values(drafts).some(
    (value) => value.body !== value.saved.body,
  );
  const dirtyPaths = new Set(
    Object.entries(drafts)
      .filter(([, value]) => value.body !== value.saved.body)
      .map(([draftPath]) => draftPath),
  );

  return {
    clear,
    contextDocument,
    dirtyPaths,
    draft,
    dirty,
    hasDirty,
    loading,
    saving,
    error,
    change,
    save,
    reload,
    discard,
  };
}
