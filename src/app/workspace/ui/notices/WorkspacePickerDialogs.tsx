import type { ComponentProps } from "react";
import { FilePicker } from "@/features/files/ui/FilePicker";
import { DeleteSessionDialog } from "@/features/sessions/ui/DeleteSessionDialog";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Pick<ComponentProps<typeof FilePicker>, "cwd" | "openPaths"> & {
  store: WorkspaceStore;
};

/** The Go to File picker and the delete-session confirmation, while the store has them open. */
export function WorkspacePickerDialogs({ store, ...pickerProps }: Props) {
  const { files, navigation } = useWorkspaceHandlers();
  const filePickerOpen = useWorkspaceField(store, "filePickerOpen");
  const initialQuery = useWorkspaceField(store, "filePickerInitialQuery");
  const resetToken = useWorkspaceField(store, "filePickerResetToken");
  const deleteDialog = useWorkspaceField(store, "sessionDeleteDialog");
  const { setFilePickerOpen, setSessionDeleteDialog } = useWorkspaceActions(store);

  const onRunAction = (id: string) => {
    if (id === "reload") navigation.reload();
  };
  const onClosePicker = () => setFilePickerOpen(false);

  return (
    <>
      {filePickerOpen ? (
        <FilePicker
          {...pickerProps}
          onOpenFile={files.open}
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
