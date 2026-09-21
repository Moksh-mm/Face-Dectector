"use client";

import Image from "next/image";
import { useState } from "react";
import { cx } from "@/lib/cx";

/**
 * A round face crop that fades in once loaded, over a soft placeholder, so it
 * never pops in as an empty grey circle. Admin pages pass a person `id`; a
 * visitor's own avatar passes `src` (their session-scoped route), so no id is
 * ever involved.
 */
export function PersonAvatar({
  id,
  src,
  name,
  size,
  shape = "circle",
  className = "",
}: {
  id?: string;
  src?: string;
  name: string;
  size: number;
  shape?: "circle" | "rounded";
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <span
      className={cx(
        "shimmer block aspect-square overflow-hidden",
        shape === "circle" ? "rounded-full" : "rounded-[1.25rem]",
        className
      )}
    >
      <Image
        src={src ?? `/api/immich/people/${id}/thumbnail`}
        alt={name || "Your face"}
        width={size}
        height={size}
        unoptimized
        onLoad={() => setLoaded(true)}
        className={cx(
          "size-full object-cover transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
    </span>
  );
}
