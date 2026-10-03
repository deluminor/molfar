import { useRef, useSyncExternalStore, type RefObject } from "react";
import {
  getAppDialog,
  settleAppDialog,
  subscribeAppDialog,
  type AppDialogState,
} from "../model/appDialog";
import { Modal } from "../../shared/ui/Modal";

export function AppDialog() {
  const dialog = useSyncExternalStore(
    subscribeAppDialog,
    getAppDialog,
    getAppDialog,
  );
  if (!dialog) return null;

  return <AppDialogModal key={dialog.id} dialog={dialog} />;
}

function AppDialogModal({ dialog }: { dialog: AppDialogState }) {
  const okRef = useRef<HTMLButtonElement>(null);

  const onDismiss = () => {
    settleAppDialog(dialog.id, false);
  };

  const onConfirm = () => {
    settleAppDialog(dialog.id, true);
  };

  return (
    <Modal
      onClose={onDismiss}
      title={dialog.title}
      size="md"
      fitViewport
      className="max-h-[min(72vh,640px)]"
      initialFocusRef={okRef}
      footer={
        <AppDialogFooter
          okRef={okRef}
          mode={dialog.mode}
          okLabel={dialog.okLabel}
          cancelLabel={dialog.cancelLabel}
          onCancel={onDismiss}
          onConfirm={onConfirm}
        />
      }
    >
      <div className="px-5 py-4">
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-content/85">
          {dialog.body}
        </p>
      </div>
    </Modal>
  );
}

function AppDialogFooter({
  okRef,
  mode,
  okLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  okRef: RefObject<HTMLButtonElement | null>;
  mode: AppDialogState["mode"];
  okLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 text-[13px]">
      {mode === "confirm" ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 hover:bg-content/8 active:scale-[0.97]"
        >
          {cancelLabel}
        </button>
      ) : null}
      <button
        ref={okRef}
        type="button"
        onClick={onConfirm}
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110 active:scale-[0.97]"
      >
        {okLabel}
      </button>
    </div>
  );
}
