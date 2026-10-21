import type { ComponentProps } from "react";
import { FilePicker } from "@/features/files/ui/FilePicker";
import { DeleteSessionDialog } from "@/features/sessions/ui/DeleteSessionDialog";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Pick<ComponentProps<typeof FilePicker>, "cwd" | "openPaths" | "onOpenFile"> & {
  store: WorkspaceStore;
  onReload: () => void;
};

/** The Go to File picker and the delete-session confirmation, while the store has them open. */
export function WorkspacePickerDialogs({ store, onReload, ...pickerProps }: Props) {
  const filePickerOpen = useWorkspaceField(store, "filePickerOpen");
  const initialQuery = useWorkspaceField(store, "filePickerInitialQuery");
  const resetToken = useWorkspaceField(store, "filePickerResetToken");
  const deleteDialog = useWorkspaceField(store, "sessionDeleteDialog");
  const { setFilePickerOpen, setSessionDeleteDialog } = useWorkspaceActions(store);

  const onRunAction = (id: string) => {
    if (id === "reload") onReload();
  };
  const onClosePicker = () => setFilePickerOpen(false);

  return (
    <>
      {filePickerOpen ? (
        <FilePicker
          {...pickerProps}
          key={resetToken}
          open
          initialQuery={initialQuery}
          onRunAction={onRunAction}
          onClose={onClosePicker}
        />
      ) : null}

      {deleteDialog ? (
        <DeleteSessionDialog
          title={deleteDialog.title}
          unusedWorktree={deleteDialog.unusedWorktree}
          onClose={(choice) => {
            deleteDialog.resolve(choice);
            setSessionDeleteDialog(undefined);
          }}
        />
      ) : null}
    </>
  );
}
