import type { ReactNode } from "react";

export function KnowledgeAlert({ children }: { children: ReactNode }) {
  return (
    <div
      className="border-b border-stroke border-l-[3px] border-l-accent bg-content/[0.03] px-4 py-2.5 text-[12px] text-content"
      role="alert"
    >
      {children}
    </div>
  );
}
