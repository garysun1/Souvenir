"use client";

import type { ComponentProps } from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "cn";

export function BottomSheet({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "top-auto bottom-0 left-1/2 -translate-x-1/2 translate-y-0 rounded-t-[20px] rounded-b-none",
        className,
      )}
      {...props}
    />
  );
}
