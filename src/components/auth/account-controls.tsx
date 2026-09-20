"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";

export function AccountControls() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut({
        scope: "local",
      });
      if (signOutError) throw new Error("Sign-out failed. Check your connection and try again.");
      window.location.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed. Please retry.");
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => void signOut()} disabled={pending} variant="outline">
        {pending ? "Signing out…" : "Sign out of this device"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
