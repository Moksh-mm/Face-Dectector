import type { Asset } from "@/lib/immich";

/**
 * Where a gallery gets its photos from. The same gallery serves two audiences
 * through two sets of routes:
 *
 *  - admin: any person, by id, via /api/immich (admin cookie required);
 *  - visitor: only the scan session's own person, via /api/photos, with no
 *    person id anywhere in the URL.
 */
export type AssetSource = {
  listUrl: (page: number) => string;
  thumbnailUrl: (asset: Asset, size: "thumbnail" | "preview") => string;
  originalUrl: (asset: Asset) => string;
};

export const adminSource = (personId: string): AssetSource => ({
  listUrl: (page) => `/api/immich/people/${personId}/assets?page=${page}`,
  thumbnailUrl: (asset, size) =>
    `/api/immich/assets/${asset.id}/thumbnail?size=${size}`,
  originalUrl: (asset) => `/api/immich/assets/${asset.id}/original`,
});

export const visitorSource: AssetSource = {
  listUrl: (page) => `/api/photos/assets?page=${page}`,
  thumbnailUrl: (asset, size) =>
    `/api/photos/assets/${asset.id}/thumbnail?size=${size}&sig=${asset.sig}`,
  originalUrl: (asset) =>
    `/api/photos/assets/${asset.id}/original?sig=${asset.sig}`,
};
