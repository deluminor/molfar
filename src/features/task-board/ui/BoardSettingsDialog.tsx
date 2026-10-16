import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "../../../shared/ui/Modal";
import type { BoardSettings } from "../types/settings";
import { FIELD, FIELD_LABEL, PRIMARY_BUTTON, QUIET_BUTTON } from "./button-styles";
import { NotificationsRow } from "./NotificationsRow";

type Props = {
  settings: BoardSettings;
  onSave: (settings: BoardSettings) => Promise<void>;
  onClose: () => void;
};

export function BoardSettingsDialog({ settings, onSave, onClose }: Props): ReactNode {
  const [concurrency, setConcurrency] = useState(settings.maxConcurrentStages);
  const [stall, setStall] = useState(settings.stallMinutes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...settings, maxConcurrentStages: concurrency, stallMinutes: stall });
      onClose();
    } catch (reason: unknown) {
      setError(String(reason));
      setBusy(false);
    }
  };

  return (
    <Modal title="Board settings" size="sm" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 px-4 pb-4 pt-3">
        <label className={FIELD_LABEL}>
          Stages running at once
          <input
            type="number"
            min={1}
            max={10}
            value={concurrency}
            onChange={(event) => setConcurrency(Number(event.target.value))}
            className={`${FIELD} tabular-nums`}
          />
        </label>
        <label className={FIELD_LABEL}>
          Notify when a stage runs longer than (minutes)
          <input
            type="number"
            min={1}
            max={1440}
            value={stall}
            onChange={(event) => setStall(Number(event.target.value))}
            className={`${FIELD} tabular-nums`}
          />
        </label>
        <NotificationsRow />
        <p className="text-[12px] leading-5 text-content/45">
          Each agent column picks its model and skills from the chip under its title. Cards can override the
          model when you retry.
        </p>
        {error ? (
          <p role="alert" className="text-[12px] text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={QUIET_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
