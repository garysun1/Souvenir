"use client";

import Link from "next/link";
import type { UserDetailDto } from "../../../shared/worldwide-contract";
import { useAccount } from "@/components/account/account-provider";
import { useMemoryResource } from "./memory-state";

export function AuthorName({ userId }: { userId: string }) {
  const { data } = useAccount();
  const own = data?.user.id === userId;
  const profile = useMemoryResource<UserDetailDto>(own ? null : `/api/users/${userId}`);
  return (
    <Link href={own ? "/profile" : `/users/${userId}`} className="text-brand underline">
      {own
        ? `${data.user.displayName} (you)`
        : (profile.data?.user.displayName ?? `Contributor · ${userId.slice(0, 8)}`)}
    </Link>
  );
}
