import type MapLibre from "maplibre-gl";

export interface MapDestination {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function mountDestinationMap(
  maplibregl: typeof MapLibre,
  container: HTMLElement,
  places: MapDestination[],
  onSelect: (id: string) => void,
  onError: () => void,
) {
  try {
    return createDestinationMap(maplibregl, container, places, onSelect, onError);
  } catch {
    onError();
  }
}

function createDestinationMap(
  maplibregl: typeof MapLibre,
  container: HTMLElement,
  places: MapDestination[],
  onSelect: (id: string) => void,
  onError: () => void,
) {
  const valid = places.filter(
    (place) =>
      Number.isFinite(place.lat) &&
      Math.abs(place.lat) <= 85 &&
      Number.isFinite(place.lng) &&
      Math.abs(place.lng) <= 180,
  );
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        streets: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxzoom: 19,
        },
      },
      layers: [{ id: "streets", type: "raster", source: "streets" }],
    },
    center: valid.length ? [valid[0].lng, valid[0].lat] : [0, 20],
    zoom: valid.length === 1 ? 13 : 1,
    scrollZoom: false,
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.on("error", onError);
  const markers = valid.map((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Preview ${place.name}`);
    button.title = place.name;
    Object.assign(button.style, {
      width: "44px",
      height: "44px",
      borderRadius: "50%",
      border: "3px solid white",
      background: "#144F5D",
      color: "white",
      cursor: "pointer",
      boxShadow: "0 2px 8px #0004",
    });
    button.textContent = "●";
    button.addEventListener("click", () => onSelect(place.id));
    return new maplibregl.Marker({ element: button }).setLngLat([place.lng, place.lat]).addTo(map);
  });
  if (valid.length > 1) {
    const bounds = new maplibregl.LngLatBounds();
    valid.forEach((place) => bounds.extend([place.lng, place.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
  }
  const resize = new ResizeObserver(() => map.resize());
  resize.observe(container);
  return () => {
    resize.disconnect();
    markers.forEach((marker) => marker.remove());
    map.remove();
  };
}
