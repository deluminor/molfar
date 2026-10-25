import { type ComponentProps, useMemo } from "react";
import { FilePicker } from "@/features/files/ui/FilePicker";
import { DeleteSessionDialog } from "@/features/sessions/ui/DeleteSessionDialog";
import { openFilePaths } from "@/features/workspace/model/open-file-paths";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Pick<ComponentProps<typeof FilePicker>, "cwd"> & {
  store: WorkspaceStore;
};

/** The Go to File picker and the delete-session confirmation, while the store has them open. */
export function WorkspacePickerDialogs({ store, ...pickerProps }: Props) {
  const { files, navigation } = useWorkspaceHandlers();
  const filePickerOpen = useWorkspaceField(store, "filePickerOpen");
  const initialQuery = useWorkspaceField(store, "filePickerInitialQuery");
  const resetToken = useWorkspaceField(store, "filePickerResetToken");
  const deleteDialog = useWorkspaceField(store, "sessionDeleteDialog");
  const tabs = useWorkspaceField(store, "tabs");
  const openPaths = useMemo(() => openFilePaths(tabs), [tabs]);
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
          openPaths={openPaths}
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
