"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SignedPhotoDto } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/web/api";

export function SignedPhoto({
  editionId,
  photo,
  alt,
}: {
  editionId: string;
  photo: SignedPhotoDto;
  alt: string;
}) {
  return <Photo key={photo.url} editionId={editionId} photo={photo} alt={alt} />;
}

function Photo({
  editionId,
  photo,
  alt,
}: {
  editionId: string;
  photo: SignedPhotoDto;
  alt: string;
}) {
  const { request } = useAccount();
  const [current, setCurrent] = useState(photo);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(
      () => {
        void request<SignedPhotoDto>(`/api/editions/${editionId}/photo`)
          .then((fresh) => {
            if (active) {
              setCurrent(fresh);
              setRetry(0);
              setError(null);
            }
          })
          .catch((failure) => {
            if (active) setError(errorMessage(failure));
          });
      },
      retry ? 0 : Math.max(0, new Date(current.expiresAt).getTime() - Date.now() - 15_000),
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [current.expiresAt, editionId, request, retry]);

  return (
    <div className="space-y-2">
      {!error && (
        <Image
          src={current.url}
          alt={alt}
          width={1000}
          height={750}
          unoptimized
          className="max-h-96 w-full rounded-xl object-contain"
          onError={() =>
            setError("The private photo could not be loaded. Refresh its access link below.")
          }
        />
      )}
      <ErrorNotice message={error} />
      {error && (
        <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
          Reload private photo
        </Button>
      )}
    </div>
  );
}
