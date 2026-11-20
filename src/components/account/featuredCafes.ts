export type FeaturedCafeRelation = 'owned' | 'favorite';

/** Draft shape held in form state. Mirrors the request body sent on save
 *  plus server-computed `ownerVerified` (read-only here; refreshed by the
 *  GET round-trip after each save). `websiteUri` is captured from the
 *  picker so the server can re-run domain verification on save without
 *  another Places API call — never shown in the UI. */
export interface FeaturedCafeDraft {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: FeaturedCafeRelation;
  note: string;
  linkInstagram: string;
  linkWebsite: string;
  linkMenu: string;
  linkBookingExternal: string;
  ownerPinnedNote: string;
  websiteUri: string | null;
  /** Google Maps deep link captured from the picker. Persisted server-
   *  side so the booking-approve flow can surface "Open in Maps" on
   *  the visitor's confirmation email when this cafe is the host's
   *  pick. Not user-editable in the AccountPage UI. */
  googleMapsUri: string | null;
  ownerVerified: boolean;
}

export const FEATURED_MAX = 5;

export const FEATURED_NOTE_MAX = 140;

export const FEATURED_PINNED_NOTE_MAX = 80;

export const FEATURED_LINK_MAX = 200;

export function emptyCafeFromPicked(
  picked: {
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    websiteUri?: string | null;
    googleMapsUri?: string | null;
  },
  relation: FeaturedCafeRelation,
): FeaturedCafeDraft {
  return {
    placeId: picked.placeId,
    name: picked.name,
    address: picked.address,
    lat: picked.lat,
    lng: picked.lng,
    relation,
    note: '',
    linkInstagram: '',
    linkWebsite: '',
    linkMenu: '',
    linkBookingExternal: '',
    ownerPinnedNote: '',
    websiteUri: picked.websiteUri ?? null,
    googleMapsUri: picked.googleMapsUri ?? null,
    ownerVerified: false,
  };
}

/** A featured café as GET /api/account returns it. */
export interface ApiFeaturedCafe {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  relation: FeaturedCafeRelation;
  note: string | null;
  linkInstagram: string | null;
  linkWebsite: string | null;
  linkMenu: string | null;
  linkBookingExternal: string | null;
  ownerPinnedNote: string | null;
  googleMapsUri: string | null;
  ownerVerified: boolean;
}

export function cafeFromApi(c: ApiFeaturedCafe): FeaturedCafeDraft {
  return {
    placeId: c.placeId,
    name: c.name,
    address: c.address,
    lat: c.lat,
    lng: c.lng,
    relation: c.relation,
    note: c.note ?? '',
    linkInstagram: c.linkInstagram ?? '',
    linkWebsite: c.linkWebsite ?? '',
    linkMenu: c.linkMenu ?? '',
    linkBookingExternal: c.linkBookingExternal ?? '',
    ownerPinnedNote: c.ownerPinnedNote ?? '',
    // websiteUri is server-only — not returned by GET. Stays null until the
    // user re-picks via autocomplete; the verified flag stays sticky.
    websiteUri: null,
    googleMapsUri: c.googleMapsUri,
    ownerVerified: c.ownerVerified,
  };
}

/** What a draft list would save, for "is anything unsaved?" comparisons. */
export function cafesKey(list: FeaturedCafeDraft[]): string {
  return JSON.stringify(
    list.map((c) => [
      c.placeId,
      c.relation,
      c.note.trim(),
      c.linkInstagram.trim(),
      c.linkWebsite.trim(),
      c.linkMenu.trim(),
      c.linkBookingExternal.trim(),
      c.ownerPinnedNote.trim(),
    ]),
  );
}
