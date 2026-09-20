import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/account/account-state";

export function ResourceState({
  loading,
  error,
  retry,
  label = "Loading…",
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
  label?: string;
}) {
  return (
    <div aria-live="polite" className="space-y-2">
      {loading && (
        <p role="status" className="text-sm text-text-secondary">
          {label}
        </p>
      )}
      <ErrorNotice message={error} />
      {error && (
        <Button type="button" variant="outline" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}
