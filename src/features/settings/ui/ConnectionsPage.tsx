import { ConnectionsSettings } from "@/features/connections/ui/ConnectionsSettings";
import { MobileSettings } from "@/features/mobile/ui/MobileSettings";

/** Settings → Connections: remote machines, then paired phones. */
export function ConnectionsPage() {
  return (
    <div className="flex flex-col gap-10">
      <ConnectionsSettings />
      <MobileSettings />
    </div>
  );
}
