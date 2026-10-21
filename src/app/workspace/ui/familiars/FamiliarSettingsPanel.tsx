import type { Session } from "@/domain/session/session";
import type { HarnessId } from "@/domain/harness/harness";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import {
  type Familiar,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { FamiliarSettingsDialog } from "@/features/familiars/ui/FamiliarSettingsDialog";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = {
  store: WorkspaceStore;
  familiar: Familiar;
  session: Session;
  onModelChange: (sessionId: string, harness: HarnessId, model: string) => void;
  onModelSettingsChange: (sessionId: string, settings: Record<string, string>) => void;
  onRuntimeModeChange: (sessionId: string, mode: RuntimeMode) => void;
  onReset: (sessionId: string) => Promise<void>;
};

/** The open Familiar's settings dialog, while it is the one asked for. */
export function FamiliarSettingsPanel({
  store,
  familiar,
  session,
  onModelChange,
  onModelSettingsChange,
  onRuntimeModeChange,
  onReset,
}: Props) {
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
      onModelChange={(harness, model) => onModelChange(session.id, harness, model)}
      onModelSettingsChange={(settings) => onModelSettingsChange(session.id, settings)}
      onRuntimeModeChange={(mode) => onRuntimeModeChange(session.id, mode)}
      onReset={() => onReset(session.id)}
      onClose={() => setFamiliarSettingsFor(null)}
    />
  );
}
