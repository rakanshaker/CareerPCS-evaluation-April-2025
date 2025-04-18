import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  Marker as TMarker,
  MarkerClusterGroup as TMarkerClusterGroup,
} from "leaflet";
import { EllipsisIcon, MapIcon } from "lucide-react";
import React, { useImperativeHandle } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useMatch,
  useMatches,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { LatLngBounds, Map, MarkerCluster } from "~/libs.client/leaflet.client";
import {
  Circle,
  CircleMarker,
  MapContainer,
  MarkerClusterGroup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvent,
  ZoomControl,
} from "~/libs.client/react-leaflet.client";
import { Companies, db, PostLocations, Posts } from "~/services.server/store";
import { Offcenter } from "~/shared/leaflet/offcenter";
import { ReactMarker } from "~/shared/leaflet/react-marker";
import {
  useEventCallback,
  useIsomorphicLayoutEffect,
} from "~/shared/react-hooks";
import {
  type AnySignal,
  useComputed,
  useCreateSignal,
  useCreateSignalState,
  useSignal,
  useSignalEffect,
} from "~/shared/signals";
import { useDralSafearea } from "./DralSafearea";
import { createClusterIcon, createHighlightedClusterIcon } from "./Markers";
import PinIcon from "./icons/PinIcon";
import { useMapPositioning } from "~/hooks/useMapPositioning";

import tailwind_url from "~/app.css?url";

export const links = () => {
  return [
    {
      rel: "stylesheet",
      href: tailwind_url,
    },
  ];
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const database = db(context);

  const companies = await database.fetch(Companies.all());
  const locations_promise = database.fetch(PostLocations.all());
  const posts_promise = database.fetch(Posts.all());

  const locations = await locations_promise;
  const posts = await posts_promise;

  return {
    locations: locations,
    companies: companies,
    posts: posts,
  };
};

const MapEvents = ({
  onBoundsChange,
}: {
  onBoundsChange?: (bounds: LatLngBounds) => void;
}) => {
  const map = useMap();
  const mapstate$ = useMapStateSignal();

  useMapEvent("zoomend", () => {
    // @ts-ignore
    window.map_zoom = map.getZoom();
    const safearea = mapstate$.get().safearea;
    onBoundsChange?.(Offcenter.getBounds(map, safearea));
  });
  useMapEvent("moveend", () => {
    const safearea = mapstate$.get().safearea;
    onBoundsChange?.(Offcenter.getBounds(map, safearea));
  });

  React.useEffect(() => {
    const safearea = mapstate$.get().safearea;
    onBoundsChange?.(Offcenter.getBounds(map, safearea));
  }, []);

  /// This shouldn't be in <MapEvents />
  const navigate = useNavigate();
  const coordinates = useParams().coordinates ?? "";
  const is_root = useMatch({
    path: "/:coordinates",
    end: true,
  });

  useMapEvent("click", (event) => {
    if (!is_root) {
      navigate(`/${coordinates}`);
    }
  });

  return null;
};

const InvalidateMapOnRouteChange = () => {
  const map = useMap();
  const route = useLocation();
  useIsomorphicLayoutEffect(() => {
    map.invalidateSize();
  }, [route.key]);
  return null;
};

const MILE = 1609.34; // 1 mile in meters

type PcsLocationLite = {
  id: string;
  data: {
    company: string;
    coordinates: { lat: number; lng: number };
  };
  posts: Array<{
    id: string;
    data: {};
  }>;
};

type PcsPostLite = {
  id: string;
  company: {
    id: string;
    data: {
      name: string;
    };
  };
  data: {
    title: string;
  };
  locations: Array<{
    id: string;
    data: {
      coordinates: { lat: number; lng: number };
    };
  }>;
};

type PostId =
  | { type: "dod-post"; id: string }
  | { type: "pcs-post"; id: string };
type LocationId =
  | { type: "dod-location"; id: string }
  | { type: "pcs-location"; id: string };

type MapState = {
  list_hover: PostId | null;
  selected_location: LocationId | null;
  selected_post: PostId | null;
  safearea: { top: number; right: number; bottom: number; left: number };
};

const MapStateSignalContext = React.createContext<AnySignal<MapState> | null>(
  null,
);
const useMapStateSignal = () => {
  const mapstatesignal = React.useContext(MapStateSignalContext);
  if (mapstatesignal == null) {
    throw new Error("useMapState must be used within a MapStateProvider");
  }
  return mapstatesignal;
};

// prettier-ignore
const async = async async => async()

export default function MapScreen() {
  const { companies, locations, posts } = useLoaderData<typeof loader>();
  const mapRef = React.useRef<Map | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  const pcs_locations = React.useMemo(() => {
    return locations.map((location) => {
      return {
        id: location.id,
        data: location.data,
        posts: posts.filter((x) => x.data.locations.includes(location.id)),
        company: companies.find((x) => x.id === location.data.company)!,
      };
    });
  }, [locations, posts, companies]);
  const pcs_posts = React.useMemo(() => {
    return posts.map((post) => {
      return {
        id: post.id,
        data: post.data,
        locations: locations.filter((x) => post.data.locations.includes(x.id)),
        company: companies.find((x) => x.id === post.data.company)!,
      };
    });
  }, [locations, posts, companies]);

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const [search_params, set_search_params] = useSearchParams();

  const [map_bounds, set_map_bounds] = React.useState<LatLngBounds | null>(
    null,
  );

  const skillbridges_filtered = pcs_posts;

  const pcs_locations_filtered = React.useMemo(() => {
    return pcs_locations.filter((location) => {
      return location.posts.some((post) =>
        skillbridges_filtered.some((post_b) => post.id === post_b.id),
      );
    });
  }, [pcs_locations, skillbridges_filtered]);

  const skillbridges_filtered_listview = React.useMemo(() => {
    return pcs_posts.filter((skillbridge, index) => {
      return skillbridge.locations.some((location) => {
        return (
          map_bounds == null ||
          map_bounds.contains([
            location.data.coordinates.lat,
            location.data.coordinates.lng,
          ])
        );
      });
    });
  }, [pcs_posts, map_bounds]);

  const map_ref = React.useRef<Map>(null);
  const pcs_cluster_ref = React.useRef<TMarkerClusterGroup>(null as any);
  const pcs_marker_refs = React.useRef<{ [id: string]: TMarker }>({});
  const dod_cluster_ref = React.useRef<TMarkerClusterGroup>(null as any);
  const dod_marker_refs = React.useRef<{ [id: string]: TMarker }>({});

  const open_pcs_1 = useMatch("/location/:location/*")?.params;
  const open_pcs_2 = useMatch("/post/:post/location/:location/*")?.params;
  const open_pcs_3 = useMatch("/post/:post/*")?.params;
  const open_pcs = open_pcs_1 ?? open_pcs_2 ?? open_pcs_3 ?? ({} as any);

  const infoSectionRef = React.useRef<HTMLDivElement>(null);
  const [measuredInfoBoxWidth, setMeasuredInfoBoxWidth] = React.useState(0);

  const [isSidebarReady, setIsSidebarReady] = React.useState(false);

  const locationId = "location" in open_pcs ? open_pcs.location : null;
  const postId = "post" in open_pcs ? open_pcs.post : null;

  const [sidebarWidth, setSidebarWidth] = React.useState(0);
  const [mapTriggerKey, setMapTriggerKey] = React.useState(0);

  const [user_location, set_user_location] = React.useState<
    [number, number] | null
  >(null);
  
  const safearea = useDralSafearea();

  const combinedOffsets = React.useMemo(() => {
    if (!safearea.ready) return null;
    const base = safearea.get();
    return {
      ...base,
      left: base.left + sidebarWidth,
    };
  }, [safearea.ready, sidebarWidth]);
  
  React.useEffect(() => {
    if (sidebarWidth > 0 && safearea.ready) {
      console.log("🚀 Triggering map positioning because postId/locationId changed.");
      setMapTriggerKey((k) => k + 1); // Increment to trigger re-run
    }
  }, [sidebarWidth, safearea.ready, open_pcs.post, open_pcs.location]);

  console.log("📦 sidebarWidth", sidebarWidth);
  console.log("📦 safearea.ready", safearea.ready);

  useMapPositioning({
    map: map_ref.current,
    postId: open_pcs.post,
    locationId: "location" in open_pcs ? open_pcs.location : null,
    sidebarWidth,
    offsets: combinedOffsets,
    pcs_posts,
    markerRefs: pcs_marker_refs.current,
    clusterGroup: pcs_cluster_ref.current,
    triggerKey: mapTriggerKey.toString(),
  });

  
  const selected_location = React.useMemo<MapState["selected_location"]>(() => {
    if ("location" in open_pcs) {
      return { type: "pcs-location", id: open_pcs.location! };
    } else {
      return null;
    }
  }, ["location" in open_pcs && open_pcs.location]);

  const selected_post = React.useMemo<MapState["selected_post"]>(() => {
    if ("post" in open_pcs) {
      return { type: "pcs-post", id: open_pcs.post! };
    } else {
      return null;
    }
  }, ["post" in open_pcs && open_pcs.post]);

  const [list_hover, set_list_hover] =
    React.useState<MapState["list_hover"]>(null);
  const list_onhoverin = useEventCallback((id: PostId) => {
    set_list_hover(id);
  });
  const list_onhoverout = useEventCallback((id: PostId) => {
    set_list_hover(null);
  });

  const mapstatesignal = useCreateSignal<MapState>(
    {
      selected_location: selected_location,
      selected_post: selected_post,
      list_hover: list_hover,
      safearea: safearea.offsets,
    },
    [selected_location, selected_post, list_hover, safearea.offsets],
  );

  const open_coordinates = (
    useMatches().find((x: any) => Array.isArray(x.data?.coordinates)) as any
  )?.data.coordinates;

  const maybe_coordinates_match = location.pathname
    .split("/")
    .at(-1)!
    .match(
      /@(?<lat>-?\d+(\.\d+)?),(?<lng>-?\d+(\.\d+)?),(?<zoom>\d+(\.\d+)?)z/,
    );

  const initial_position: [number, number] | null =
    maybe_coordinates_match?.groups ?
      [
        parseFloat(maybe_coordinates_match.groups.lat),
        parseFloat(maybe_coordinates_match.groups.lng),
      ]
    : open_coordinates;

  const initial_zoom =
    maybe_coordinates_match?.groups?.zoom ?
      parseFloat(maybe_coordinates_match.groups.zoom)
    : open_coordinates != null ? 12
    : 4.5;

  const location_text$ = useCreateSignalState("");

  React.useEffect(() => {
    const bounds_center = map_bounds?.getCenter();
    if (!bounds_center) return;
    const zoom = map_ref.current?.getZoom();
    if (!zoom) return;

    const map_center = map_ref.current!.getCenter();
    const map_center_fix = Offcenter.uncenter(
      [map_center.lat, map_center.lng],
      zoom,
      safearea.offsets,
    );

    const center = map_center_fix;
    const new_coordinates = `@${center.lat.toFixed(7)},${center.lng.toFixed(7)},${zoom}z`;

    const path = location.pathname.split("/").filter((x) => x !== "");
    const maybe_coordinates = path.at(-1);

    if (maybe_coordinates?.startsWith("@")) {
      const before_coordinates = path.slice(0, -1);
      navigate(`/${before_coordinates.join("/")}/${new_coordinates}`, {
        replace: true,
        preventScrollReset: true,
      });
    } else {
      navigate(`/${path.join("/")}/${new_coordinates}`, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [map_bounds]);

  return (
    <MapStateSignalContext.Provider value={mapstatesignal}>
      <div className="flex h-screen flex-1 flex-row bg-blue-200">
        <div className="fixed inset-0 z-10 hidden flex-1 overflow-hidden border-r bg-white shadow md:static md:inset-auto md:flex md:min-h-0 md:max-w-[400px] md:flex-col">
          <div className="flex flex-col border-b px-4 py-2 pt-4"></div>
          <div className="flex flex-1 flex-col">
            <List
              skillbridges={skillbridges_filtered_listview}
              onHoverIn={list_onhoverin}
              onHoverOut={list_onhoverout}
            />
          </div>
          <div className="align-center flex flex-col border-t py-1">
            {/* <span className="text-center text-sm">
                Powered by{" "}
                <a
                  className="text-blue-600"
                  href="https://findmyskillbridge.com"
                >
                  FindMySkillBridge.com
                </a>
              </span> */}
            <div className="flex flex-col text-center text-sm">
              <Link
                reloadDocument
                // href="https://skillbridge-navigators.ck.page/custom-skillbridge"
                className="self-stretch text-center text-sm text-blue-600 hover:underline"
                to="/terms-of-service"
              >
                Service agreement
              </Link>
            </div>
          </div>
        </div>

        <div
          className="relative flex flex-[2] flex-col"
          ref={safearea.container_ref}
        >
          {/* <div id="map" ref={map_ref} /> */}
          {hydrated && safearea.ready && (
            <MapContainer
              zoomSnap={0}
              maxZoom={12}
              minZoom={3}
              id="map"
              ref={map_ref}
              className="z-0 flex-1"
              center={
                initial_position ?
                  Offcenter.recenter(
                    [initial_position[0], initial_position[1]],
                    initial_zoom,
                    safearea.offsets,
                  )
                : [37.8, -96]
              }
              zoom={initial_zoom}
              zoomControl={false}
              scrollWheelZoom={false}
              // @ts-ignore
              smoothWheelZoom={true}
              smoothSensitivity={10}
              style={{ height: "100%", width: "100%", overflow: "hidden" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <ZoomControl position="bottomright" />

              <MapEvents
                onBoundsChange={(bounds) => {
                  React.startTransition(() => {
                    set_map_bounds(bounds);
                  });
                }}
              />
              <InvalidateMapOnRouteChange />

              <PcsMarkersMemo
                cluster_ref={dod_cluster_ref}
                marker_refs={dod_marker_refs}
                posts={pcs_locations_filtered}
              />

              {user_location && (
                <React.Fragment>
                  <Circle center={user_location} radius={50 * MILE}>
                    <Tooltip
                      permanent
                      direction="right"
                      className="radius-tooltip"
                      content="50-mile radius"
                      // position={[user_location[0], user_location[1]]}
                      offset={[50, 0]}
                      // opacity={1}
                    />
                  </Circle>
                  <CircleMarker
                    center={user_location}
                    radius={5}
                    color="blue"
                  />
                </React.Fragment>
              )}
            </MapContainer>
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col-reverse justify-start overflow-hidden md:flex-row">
            <div className="pointer-events-auto contents">
              <Outlet context={{ infoSectionRef, setSidebarWidth }}/>
            </div>
            <div
              className="absolute inset-0 m-4 md:static md:inset-auto md:flex-1"
              ref={safearea.safearea_ref}
            />
          </div>
        </div>
      </div>
    </MapStateSignalContext.Provider>
  );
}

const ListItemEventsContext = React.createContext<{
  onHoverIn?: (id: PostId) => void;
  onHoverOut?: (id: PostId) => void;
}>({});

const ListItemEventsContextProvider = ({
  children,
  onHoverIn,
  onHoverOut,
}: {
  children: React.ReactNode;
  onHoverIn?: (id: PostId) => void;
  onHoverOut?: (id: PostId) => void;
}) => {
  const value = React.useMemo(
    () => ({ onHoverIn, onHoverOut }),
    [onHoverIn, onHoverOut],
  );
  return (
    <ListItemEventsContext.Provider value={value}>
      {children}
    </ListItemEventsContext.Provider>
  );
};

const PcsListItem = ({
  data,
  style,
  index,
}: {
  data: PcsPostLite;
  style?: any;
  index: number;
}) => {
  const { data: skillbridge, company, locations, id } = data;

  const { onHoverIn, onHoverOut } = React.useContext(ListItemEventsContext);
  const coordinates = useParams().coordinates ?? "";

  const mapstate$ = useMapStateSignal();
  const is_selected$ = useComputed(() => {
    return mapstate$.get().selected_post?.id === id;
  }, [mapstate$, id]);
  const is_selected = useSignal(is_selected$);

  const to = `/post/${id}/${coordinates}`;
  return (
    <Link
      to={to}
      onMouseEnter={() => {
        onHoverIn?.({ type: "pcs-post", id: id });
      }}
      onMouseLeave={() => {
        onHoverOut?.({ type: "pcs-post", id: id });
      }}
      data-selected={is_selected}
      style={style}
      className="data-[selected=true]:bg-primary flex flex-row items-center gap-4 overflow-hidden border-b bg-white px-4 py-2 hover:bg-gray-100"
    >
      <div className="size-[60px] shrink-0 rounded bg-gray-200 object-contain object-center"></div>

      <div className="flex min-w-0 flex-col justify-center py-2">
        <div className="flex flex-row flex-wrap gap-4">
          <span className="line-clamp-1 text-sm text-green-500">
            Actively recruiting
          </span>
        </div>
        <span className="line-clamp-2 font-bold">{skillbridge.title}</span>
        <span className="line-clamp-1">{company.data.name}</span>
        <address>{locations.length} locations</address>
      </div>
    </Link>
  );
};

const List = React.memo(
  ({
    skillbridges,
    onHoverIn,
    onHoverOut,
  }: {
    skillbridges: Array<PcsPostLite>;
    onHoverIn?: (id: PostId) => void;
    onHoverOut?: (id: PostId) => void;
  }) => {
    const parent_ref = React.useRef<HTMLDivElement>(null);

    const mapstate$ = useMapStateSignal();

    const selected$ = useComputed(() => {
      return mapstate$.get().selected_post;
    }, [mapstate$]);

    const rowVirtualizer = useVirtualizer({
      count: skillbridges.length,
      getScrollElement: () => parent_ref.current,
      estimateSize: () => 120,
    });

    const selected_callback = useEventCallback(() => {
      const selected = selected$.get();
      if (selected) {
        const index = skillbridges.findIndex((x) => x.id === selected.id);
        // list_ref.current?.scrollToItem(index, "smart");
        rowVirtualizer.scrollToIndex(index, {
          behavior: "smooth",
          align: "auto",
        });
      }
    });
    useSignalEffect(selected_callback, [selected$]);

    return (
      <ListItemEventsContextProvider
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
      >
        <div className="min-h-0 flex-1 basis-0 overflow-auto" ref={parent_ref}>
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  // height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <PcsListItem
                  index={virtualItem.index}
                  data={skillbridges[virtualItem.index as 1]}
                  // style={style}
                />
              </div>
            ))}
          </div>
        </div>
      </ListItemEventsContextProvider>
    );
  },
);

const PcsMarker = ({ post: location }: { post: PcsLocationLite }) => {
  const mapstate$ = useMapStateSignal();

  /// TODO
  const is_hovered_in_list$ = useComputed(
    () =>
      location.posts.some((post) =>
        marker_equals(mapstate$.get().list_hover, {
          type: "pcs-post",
          id: post.id,
        }),
      ),
    [mapstate$],
  );
  const is_hovered_in_list = useSignal(is_hovered_in_list$);

  /// TODO
  const is_selected_post = useSignal(
    useComputed(
      () =>
        location.posts.some((post) =>
          marker_equals(mapstate$.get().selected_post, {
            type: "pcs-post",
            id: post.id,
          }),
        ),
      [mapstate$],
    ),
  );
  const is_selected_location = useSignal(
    useComputed(
      () =>
        marker_equals(mapstate$.get().selected_location, {
          type: "pcs-location",
          id: location.id,
        }),
      [mapstate$],
    ),
  );

  const coordinates = useParams().coordinates ?? "";

  const to =
    location.posts.length === 1 ?
      `/post/${location.posts[0].id}/${coordinates}`
    : `/location/${location.id}/${coordinates}`;

  return (
    is_selected_location ?
      <Link to={to} className="block -translate-x-1/2 -translate-y-full">
        <PinIcon strokeColor="#005bff" className="size-[35px] text-white" />
      </Link>
    : is_selected_post ?
      <Link to={to} className="block -translate-x-1/2 -translate-y-full">
        <PinIcon strokeColor="#005bff" className="size-[30px] text-white" />
      </Link>
    : is_hovered_in_list ?
      <Link to={to} className="-translate-x-1/2 -translate-y-1/2">
        <div
          style={{
            boxShadow: "0px 2px 3px 0px rgb(0 0 0 / 50%)",
          }}
          className="flex size-[35px] items-center justify-center rounded-full border-[4px] border-white bg-blue-700"
        >
          {MapIcon ?
            <MapIcon className="text-white" size={20} />
          : <EllipsisIcon className="text-white" size={20} />}
        </div>
      </Link>
    : <Link to={to} className="-translate-x-1/2 -translate-y-1/2">
        <div
          style={{
            boxShadow: "0px 2px 3px 0px rgb(0 0 0 / 50%)",
          }}
          className="flex size-[30px] items-center justify-center rounded-full border-[3px] border-white bg-blue-700"
        >
          <EllipsisIcon className="text-white" size={18} />
        </div>
      </Link>
  );
};

const marker_equals = <T extends PostId | LocationId>(
  a: T | null,
  b: T | null,
) => a != null && b != null && a.type === b.type && a.id === b.id;

const PcsMarkers = ({
  cluster_ref,
  marker_refs,
  posts,
}: {
  cluster_ref: React.MutableRefObject<TMarkerClusterGroup>;
  marker_refs: React.MutableRefObject<{ [id: string]: TMarker }>;
  posts: Array<PcsLocationLite>;
}) => {
  "use client";

  const mapstate$ = useMapStateSignal();

  const internal_cluster_ref = React.useRef<TMarkerClusterGroup>(null as any);
  useImperativeHandle(cluster_ref, () => internal_cluster_ref.current);

  const hover$ = useComputed(() => {
    return mapstate$.get().list_hover;
  }, [mapstate$]);
  useSignalEffect(() => {
    const hovered = hover$.get();
    if (hovered?.type !== "pcs-post") return;

    const marker = marker_refs.current[hovered.id];

    const cluster = internal_cluster_ref.current.getVisibleParent(marker);
    if (!(cluster instanceof MarkerCluster)) return;
    // if (cluster === marker) return;

    cluster.setIcon(createHighlightedClusterIcon(cluster));
    return () => {
      cluster.setIcon(createClusterIcon(cluster));
    };
  }, [mapstate$]);
  const clusterRef = React.useRef<typeof MarkerClusterGroup | null>(null);
  return (
    <MarkerClusterGroup chunkedLoading ref={internal_cluster_ref}>
      {posts.map((location, index) => (
        <ReactMarker
          zIndexOffset={100}
          ref={(x) => {
            marker_refs.current[location.id] = x!;
          }}
          keyboard={false}
          key={location.id}
          position={[
            location.data.coordinates.lat,
            location.data.coordinates.lng,
          ]}
        >
          <PcsMarker post={location} />
        </ReactMarker>
      ))}
    </MarkerClusterGroup>
  );
};

const PcsMarkersMemo = React.memo(PcsMarkers);