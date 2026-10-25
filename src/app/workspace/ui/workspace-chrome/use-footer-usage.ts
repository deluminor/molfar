import { useMemo } from "react";
import { DEFAULT_PROVIDER_ACCOUNT_ID } from "@/domain/harness/provider-account";
import type { RateLimitProvider } from "@/domain/rate-limits/rate-limit";
import type { Session } from "@/domain/session/session";
import { latestTurnNeedsHarnessLogin } from "@/integrations/harness/core/auth-support";
import type { UsageFooterSession } from "../../../shell/UsageFooter";

type FooterUsage = {
  providers: RateLimitProvider[];
  session: UsageFooterSession | undefined;
};

/** The plan usage the footer shows for the session in view; streamed blocks alone do not rebuild it. */
export function useFooterUsage(source: Session | undefined): FooterUsage {
  const harness = source?.harness;
  const providers = useMemo((): RateLimitProvider[] => {
    if (harness === "claude" || harness === "codex" || harness === "opencode" || harness === "devin") {
      return [harness];
    }
    return [];
  }, [harness]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only the fields the footer reads, so a new session object alone is no change
  const session = useMemo(() => {
    if (!source) return undefined;
    return {
      id: source.id,
      harness: source.harness,
      model: source.model,
      authRequired: latestTurnNeedsHarnessLogin(source.blocks),
      providerAccountId:
        source.providerAccountId ??
        (source.blocks.some((block) => block.role === "user") ? DEFAULT_PROVIDER_ACCOUNT_ID : undefined),
    };
  }, [source?.id, source?.harness, source?.model, source?.blocks, source?.providerAccountId]);

  return { providers, session };
}
