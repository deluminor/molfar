import type { Session } from "@/domain/session/session";
import {
  type Familiar,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { FamiliarSettingsDialog } from "@/features/familiars/ui/FamiliarSettingsDialog";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = {
  store: WorkspaceStore;
  familiar: Familiar;
  session: Session;
};

/** The open Familiar's settings dialog, while it is the one asked for. */
export function FamiliarSettingsPanel({
  store,
  familiar,
  session,
}: Props) {
  const { composer, history } = useWorkspaceHandlers();
  const settingsFor = useWorkspaceField(store, "familiarSettingsFor");
  const { setFamiliarSettingsFor } = useWorkspaceActions(store);
  if (settingsFor !== familiar.id) return null;

  return (
    <FamiliarSettingsDialog
      key={familiar.id}
      familiarId={familiar.id}
      agent={familiarLook(familiar)}
      status={familiarState(session).status}
      cwd={session.cwd}
      harness={session.harness}
      model={session.model}
      modelSettings={session.modelSettings}
      runtimeMode={session.runtimeMode}
      busy={!!session.busy}
      onModelChange={(harness, model) => composer.changeModel(session.id, harness, model)}
      onModelSettingsChange={(settings) => composer.changeModelSettings(session.id, settings)}
      onRuntimeModeChange={(mode) => composer.changeRuntimeMode(session.id, mode)}
      onReset={() => history.resetFamiliar(session.id)}
      onClose={() => setFamiliarSettingsFor(null)}
    />
  );
}
