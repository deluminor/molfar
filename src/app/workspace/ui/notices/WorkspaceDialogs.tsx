import { AddRemoteProjectDialog } from "@/features/connections/ui/AddRemoteProjectDialog";
import { ProviderSignInDialog } from "@/features/sessions/ui/ProviderSignInDialog";
import { AppDialog } from "../../../shell/AppDialog";
import { UpdatePromptDialog } from "../../../shell/UpdatePromptDialog";
import { WhatsNewDialog } from "../../../shell/WhatsNewDialog";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = {
  store: WorkspaceStore;
  onOpenProject: (key: string) => void;
};

/** The window's app-wide dialogs, each open while the store asks for it. */
export function WorkspaceDialogs({ store, onOpenProject }: Props) {
  const whatsNewVersion = useWorkspaceField(store, "whatsNewVersion");
  const remoteProjectDialogOpen = useWorkspaceField(store, "remoteProjectDialogOpen");
  const providerSignInRequest = useWorkspaceField(store, "providerSignInRequest");
  const { setWhatsNewVersion, setRemoteProjectDialogOpen, setProviderSignInRequest } =
    useWorkspaceActions(store);

  return (
    <>
      {whatsNewVersion ? (
        <WhatsNewDialog version={whatsNewVersion} onClose={() => setWhatsNewVersion(null)} />
      ) : null}
      <UpdatePromptDialog />
      <AppDialog />
      {remoteProjectDialogOpen ? (
        <AddRemoteProjectDialog
          onCancel={() => setRemoteProjectDialogOpen(false)}
          onOpen={(key) => {
            setRemoteProjectDialogOpen(false);
            onOpenProject(key);
          }}
        />
      ) : null}
      {providerSignInRequest ? (
        <ProviderSignInDialog
          key={providerSignInRequest.key}
          harness={providerSignInRequest.harness}
          onClose={() => setProviderSignInRequest(null)}
        />
      ) : null}
    </>
  );
}
