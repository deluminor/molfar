import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
/** Whether two title tab lists render the same, so the bar keeps its identity. */
export function titleTabsEqual(a: TitleTab[], b: TitleTab[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tab, index) => {
    const other = b[index];
    return (
      other != null &&
      tab.id === other.id &&
      tab.appView === other.appView &&
      tab.familiar?.mascot === other.familiar?.mascot &&
      tab.familiar?.color === other.familiar?.color &&
      tab.familiar?.status === other.familiar?.status &&
      tab.project === other.project &&
      tab.title === other.title &&
      tab.sessionCount === other.sessionCount &&
      tab.dirty === other.dirty &&
      tab.more.join("\u0000") === other.more.join("\u0000") &&
      tab.harnesses.join("\u0000") === other.harnesses.join("\u0000") &&
      tab.busyHarnesses.join("\u0000") === other.busyHarnesses.join("\u0000") &&
      (tab.doneHarnesses ?? []).join("\u0000") ===
        (other.doneHarnesses ?? []).join("\u0000") &&
      tab.files.join("\u0000") === other.files.join("\u0000") &&
      tab.multiPane === other.multiPane &&
      tab.fileFocused === other.fileFocused &&
      tab.blank === other.blank &&
      tab.terminal === other.terminal &&
      tab.previewFileId === other.previewFileId &&
      tab.groupId === other.groupId
    );
  });
}
