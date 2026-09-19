"use client";

import type { ReactNode } from "react";

export function Toast({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-[440px] items-center justify-between gap-4 rounded-lg bg-text-primary px-4 py-3 text-sm text-white shadow-lg">
      <span>{children}</span>
      {action}
    </div>
  );
}
