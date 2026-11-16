import { calculateDistance, centroid } from './midpoint';

type LatLng = { lat: number; lng: number };

export async function geocodeAddress(
  address: string,
  geocoder: google.maps.Geocoder
): Promise<LatLng> {
  const { results } = await geocoder.geocode({ address });
  if (!results[0]) throw new Error(`Geocoding failed for "${address}"`);
  const loc = results[0].geometry.location;
  return { lat: loc.lat(), lng: loc.lng() };
}

/** Parties further apart than this are almost certainly a mis-geocode for
 *  a coffee meetup, so it's worth resolving the address again with a hint. */
const FAR_APART_M = 80_000;
/** Radius of the location bias drawn around the other parties. */
const BIAS_RADIUS_M = 30_000;

/** Places text search with a soft location bias. Unlike Geocoder `bounds`,
 *  this does override an ambiguous qualifier ("New York" read as the
 *  state), while a genuinely distant place still resolves to itself.
 *  Location-only field mask keeps it on the cheapest Text Search SKU. */
async function searchTextNear(address: string, center: LatLng): Promise<LatLng | null> {
  const { Place } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
  const { places } = await Place.searchByText({
    textQuery: address,
    fields: ['location'],
    locationBias: { center, radius: BIAS_RADIUS_M },
    maxResultCount: 1,
  });
  const loc = places[0]?.location;
  return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
}

function spread(points: LatLng[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      max = Math.max(max, calculateDistance(points[i].lat, points[i].lng, points[j].lat, points[j].lng));
    }
  }
  return max;
}

/**
 * Geocode 2–3 meetup addresses. Ambiguous names resolve to the geocoder's
 * global top hit — "Central Park, New York" is Central Park in Buffalo,
 * NY — which puts the midpoint hundreds of km from either person. When the
 * parties land that far apart, re-resolve each one biased towards the
 * others and keep whichever single substitution pulls the group closest.
 * The bias is only a preference, so a genuinely distant address resolves
 * to the same place and the original result stands.
 */
export async function geocodeParties(
  addresses: string[],
  geocoder: google.maps.Geocoder
): Promise<LatLng[]> {
  const coords = await Promise.all(addresses.map((a) => geocodeAddress(a, geocoder)));
  const original = spread(coords);
  if (original <= FAR_APART_M) return coords;

  const candidates = await Promise.all(
    addresses.map(async (address, i) => {
      const center = centroid(coords.filter((_, j) => j !== i));
      try {
        const biased = await searchTextNear(address, center);
        if (!biased) return null;
        const next = coords.map((p, j) => (j === i ? biased : p));
        return { next, score: spread(next) };
      } catch {
        return null;
      }
    })
  );

  let best = { next: coords, score: original };
  for (const cand of candidates) {
    if (cand && cand.score < best.score) best = cand;
  }
  return best.next;
}
