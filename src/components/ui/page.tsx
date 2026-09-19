import type { ReactNode } from "react";
import { cn } from "cn";

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-[18px] pt-5 lg:px-8 lg:pt-8", className)}>
      {children}
    </div>
  );
}
