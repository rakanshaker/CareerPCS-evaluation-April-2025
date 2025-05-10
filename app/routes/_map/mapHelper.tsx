import { LatLngBounds, Map, MarkerCluster } from "~/libs.client/leaflet.client";
import type {
    Marker as TMarker,
    MarkerClusterGroup as TMarkerClusterGroup,
  } from "leaflet";
import { Offcenter } from "~/shared/leaflet/offcenter";
import { clamp } from "lodash-es";

export const roundZoom = (z: number) => Math.round(z * 100) / 100;

export const setHandled = (
  locationId: string | null,
  postId: string | null,
  locRef: React.RefObject<string | null>,
  postRef: React.RefObject<string | null>
) => {
  locRef.current = locationId;
  postRef.current = postId;
};

type Offsets = {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  
  export const handleLocation = async (
    map: Map,
    locationId: string,
    marker: TMarker,
    clusterGroup: TMarkerClusterGroup | null,
    offsets: Offsets,
    setHandledFn: () => void
  ) => {
    const coords = marker.getLatLng();
    const center: [number, number] = [coords.lat, coords.lng];
    const bounds = Offcenter.getBounds(map, offsets);
    const cluster = clusterGroup?.getVisibleParent(marker);
  
    if (cluster && cluster !== marker) {
      const currentZoom = map.getZoom();
      const parent = marker.__parent as MarkerCluster;
      const clusterZoom = parent._zoom as number;
  
      const targetZoom =
        currentZoom >= 7 && parent.getChildCount() < 5
          ? currentZoom
          : clamp(clusterZoom + 1, Math.max(currentZoom, 8), map.getMaxZoom());
  
      const newZoom = roundZoom(targetZoom);
      const currentCenter = map.getCenter();
  
      if (
        newZoom !== roundZoom(currentZoom) ||
        currentCenter.lat !== center[0] ||
        currentCenter.lng !== center[1]
      ) {
        map.setView(
          Offcenter.recenter(center, newZoom, offsets),
          newZoom,
          { animate: true }
        );
      }
  
      await Promise.race([
        new Promise((resolve) => map.once("moveend zoomend", resolve)),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
  
      const finalCluster = clusterGroup?.getVisibleParent(marker);
      if (finalCluster instanceof MarkerCluster) {
        await new Promise((r) => setTimeout(r, 300));
        finalCluster.spiderfy();
      }
  
      setHandledFn();
    } else {
      if (!bounds.contains(coords)) {
        const currentZoom = roundZoom(map.getZoom());
        map.setView(
          Offcenter.recenter(center, currentZoom, offsets),
          currentZoom,
          { animate: true, duration: 0.7 }
        );
      }
      setHandledFn();
    }
  };
  
  export interface PostType {
    id: string;
    locations: {
      id: string; // optional, but likely useful
      data: {
        coordinates: {
          lat: number;
          lng: number;
        };
      };
    }[];
  }
  
  
  export const handlePost = (
    map: Map,
    postId: string,
    pcs_posts: PostType[],
    sidebarWidth: number,
    setHandledFn: () => void
  ) => {
    const post = pcs_posts.find((p) => p.id === postId);
    if (!post || post.locations.length === 0) return;
  
    const latlngs = post.locations.map((loc) => [
      loc.data.coordinates.lat,
      loc.data.coordinates.lng,
    ]) as [number, number][];
  
    const bounds = new LatLngBounds(latlngs);
  
    console.log("🗺 fitBounds for post", postId, latlngs);
    // This is the main change that effects the map - sidebarWidth
    // is used to calculate the bounds of the map
    map.fitBounds(bounds, {
      paddingTopLeft: [sidebarWidth + 80, 80],
      paddingBottomRight: [80, 80],
      animate: true,
    });
  
    setHandledFn();
  };