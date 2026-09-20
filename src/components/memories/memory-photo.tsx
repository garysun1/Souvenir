"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MemoryPhotoDto } from "../../../shared/memories-contract";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryResource } from "./memory-state";

export function MemoryPhoto({ path, alt }: { path: string; alt: string }) {
  const resource = useMemoryResource<MemoryPhotoDto>(path);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!resource.data) return;
    const timer = window.setTimeout(
      resource.retry,
      Math.max(1000, Date.parse(resource.data.expiresAt) - Date.now() - 15_000),
    );
    return () => window.clearTimeout(timer);
  }, [resource.data, resource.retry]);
  const photo = !resource.loading && !resource.error ? resource.data : null;
  return (
    <div className="space-y-2">
      <ResourceState {...resource} label="Checking photo access…" />
      {photo && failedUrl !== photo.url && (
        <Image
          src={photo.url}
          alt={alt}
          width={720}
          height={540}
          unoptimized
          className="max-h-72 w-full rounded-xl bg-surface-muted object-contain"
          onError={() => setFailedUrl(photo.url)}
        />
      )}
      {photo && failedUrl === photo.url && (
        <Button variant="outline" onClick={resource.retry}>
          Reload photo
        </Button>
      )}
    </div>
  );
}
