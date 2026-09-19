import type { ButtonHTMLAttributes } from "react";
import { cn } from "cn";

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-text-secondary transition hover:bg-surface-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-brand",
        className,
      )}
      {...props}
    />
  );
}
