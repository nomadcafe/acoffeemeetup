import { useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { GOOGLE_MAPS_LIBRARIES } from '../utils/googleMapsLoader';

/**
 * Boots the Google Maps JS SDK and reports its status up to AppProvider.
 * Lives in its own lazily-imported module so routes that never touch a
 * map (public profiles, proposals, booking confirm/cancel) skip both the
 * SDK script and the @react-google-maps/api vendor chunk.
 */
export default function MapsSdkLoader({
  onStatus,
}: {
  onStatus: (status: { isLoaded: boolean; loadError: Error | undefined }) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  useEffect(() => {
    onStatus({ isLoaded, loadError });
  }, [isLoaded, loadError, onStatus]);
  return null;
}
