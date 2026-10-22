import { HARNESS_TITLE, type HarnessId } from "@/domain/harness/harness";
import { type Session } from "@/domain/session/session";
import { UsageLimitNotice } from "@/features/sessions/ui/UsageLimitNotice";
import { ModelPicker } from "@/features/sessions/ui/ModelPicker";
import { UsageLimitAccountPicker } from "@/features/sessions/ui/UsageLimitAccountPicker";

export function FamiliarUsageLimitNotice({
  session,
  onModelChange,
  onAccountChange,
  onResume,
  onResumeAtReset,
}: {
  session: Session;
  onModelChange: (harness: HarnessId, model: string) => void;
  onAccountChange?: (accountId: string) => void;
  onResume: () => void;
  onResumeAtReset: (enabled: boolean) => void;
}) {
  if (!session.usageLimit) return null;
  return (
    <UsageLimitNotice
      variant="familiar"
      limit={session.usageLimit}
      providerName={HARNESS_TITLE[session.harness]}
      onResume={onResume}
      onResumeAtReset={onResumeAtReset}
      modelPicker={
        <>
          <ModelPicker
            harness={session.harness}
            model={session.model}
            values={session.modelSettings}
            project={session.cwd}
            hideSettings
            triggerLabel="Choose another model"
            onChange={onModelChange}
            onSettingsChange={() => {}}
          />
          {onAccountChange ? (
            <UsageLimitAccountPicker
              harness={session.harness}
              accountId={session.providerAccountId}
              onSelect={onAccountChange}
            />
          ) : null}
        </>
      }
    />
  );
}
