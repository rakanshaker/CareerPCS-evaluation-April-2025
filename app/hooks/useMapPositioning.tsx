import { useEffect, useRef } from "react";
import { LatLngBounds } from "~/libs.client/leaflet.client";
import type { Map } from "~/libs.client/leaflet.client";
import type { Marker } from "leaflet";
import type { MarkerClusterGroup } from "leaflet.markercluster";
import { clamp } from "lodash-es";
import { Offcenter } from "~/shared/leaflet/offcenter";

type Offsets = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

export interface PostType {
    id: string;
    title?: string; // optional, in case you want to use it
    description?: string;
    locations: {
      id: string;
      data: {
        coordinates: {
          lat: number;
          lng: number;
        };
      };
    }[];
  }

interface UseMapPositioningProps {
  map: Map | null;
  postId: string | null;
  locationId: string | null;
  sidebarWidth: number;
  offsets: Offsets | null;
  pcs_posts: PostType[];
  markerRefs: Record<string, Marker | undefined>;
  clusterGroup: MarkerClusterGroup | null;
  triggerKey: string;
}

export function useMapPositioning({
    map,
    postId,
    locationId,
    sidebarWidth,
    offsets,
    pcs_posts,
    markerRefs,
    clusterGroup,
    triggerKey, // We use triggerKey to re-run the logic when anything changes
  }: UseMapPositioningProps) {
    const lastHandledPostId = useRef<string | null>(null);
    const lastHandledLocationId = useRef<string | null>(null);
  
    useEffect(() => {
        if (!map || !sidebarWidth || !offsets) {
          console.log("🚫 Bailing: map not ready", { map, offsets, sidebarWidth });
          return;
        }
      
        // Skip if nothing is selected
        if (!postId && !locationId) {
          console.log("❌ No post or location selected");
          return;
        }
      
        // Skip if we've already handled this post or location
        if (postId && lastHandledPostId.current === postId) {
          console.log("⏭️ Already handled post", postId);
          return;
        }
        if (locationId && lastHandledLocationId.current === locationId) {
          console.log("⏭️ Already handled location", locationId);
          return;
        }
      
        const setHandled = () => {
          if (postId) lastHandledPostId.current = postId;
          if (locationId) lastHandledLocationId.current = locationId;
        };
      
        // Handle location logic
        if (locationId) {
          const marker = markerRefs[locationId];
          if (marker) {
            console.log("📍 Centering on location", locationId);
            handleLocation(map, locationId, marker, clusterGroup, offsets, setHandled);
            return;
          }
        }
      
        // Handle post logic
        if (postId) {
          console.log("📝 Centering on post", postId);
          handlePost(map, postId, pcs_posts, sidebarWidth, setHandled);
        }
      }, [map, postId, locationId, sidebarWidth, offsets, pcs_posts, markerRefs, clusterGroup]);      
  }
  

// --- Helpers ---

const handlePost = (map: Map, postId: string, pcs_posts: PostType[], sidebarWidth: number, setHandled: Function) => {
    console.log("🏞 Handling post:", postId);
  
    const selectedPost = pcs_posts.find((post) => post.id === postId);
    if (selectedPost && selectedPost.locations.length > 0) {
      const locs = selectedPost.locations.map((l) => [
        l.data.coordinates.lat,
        l.data.coordinates.lng,
      ]) as [number, number][];
  
      const bounds = new LatLngBounds(locs);
      console.log("🗺 Fit bounds for post:", postId, bounds);
  
      map.fitBounds(bounds, {
        paddingTopLeft: [sidebarWidth + 80, 80],
        paddingBottomRight: [80, 80],
        animate: true,
      });
    }
  
    setHandled();  // Mark as handled
  };
  

function handleLocation(
  map: Map,
  locationId: string,
  marker: Marker,
  clusterGroup: MarkerClusterGroup | null,
  offsets: Offsets,
  setHandledFn: () => void
) {
  const coords = marker.getLatLng();
  const center: [number, number] = [coords.lat, coords.lng];
  const bounds = Offcenter.getBounds(map, offsets);
  const cluster = clusterGroup?.getVisibleParent(marker);

  if (cluster && cluster !== marker) {
    (async () => {
      const currentZoom = map.getZoom();
      const parent = marker.__parent as any; // MarkerCluster
      const clusterZoom = parent._zoom as number;

      const targetZoom =
        currentZoom >= 7 && cluster.getChildCount() < 5
          ? currentZoom
          : clamp(clusterZoom + 1, Math.max(currentZoom, 8), map.getMaxZoom());

      const currentCenter = map.getCenter();

      if (
        targetZoom !== currentZoom ||
        currentCenter.lat !== center[0] ||
        currentCenter.lng !== center[1]
      ) {
        map.setView(
          Offcenter.recenter(center, targetZoom, offsets),
          targetZoom,
          { animate: true }
        );
      }

      await Promise.race([
        new Promise((resolve) => map.once("moveend zoomend", resolve)),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);

      const clusterAgain = clusterGroup?.getVisibleParent(marker);
      if (clusterAgain?.spiderfy) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        clusterAgain.spiderfy();
      }

      setHandledFn();
    })();
  } else {
    if (!bounds.contains(coords)) {
      const currentZoom = map.getZoom();
      map.setView(
        Offcenter.recenter(center, currentZoom, offsets),
        currentZoom,
        { animate: true, duration: 0.7 }
      );
    }
    setHandledFn();
  }
}
