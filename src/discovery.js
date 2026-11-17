import { distanceKm } from "./location.js";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const FILTERS = {
  comer: ['node["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]', 'way["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]', 'relation["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]'],
  cafe: ['node["amenity"~"^(cafe|ice_cream)$"]', 'way["amenity"~"^(cafe|ice_cream)$"]', 'node["shop"~"^(bakery|pastry|confectionery)$"]', 'way["shop"~"^(bakery|pastry|confectionery)$"]'],
  dormir: ['node["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]', 'way["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]', 'relation["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]'],
  comprar: ['node["shop"]', 'way["shop"]', 'relation["shop"]'],
  gasolinera: ['node["amenity"="fuel"]', 'way["amenity"="fuel"]'],
  otros: ['node["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]', 'way["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]', 'relation["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]']
};

export function discoveryStatus() {
  return { ready: true, message: "Busca establecimientos reales próximos a tu ubicación mediante OpenStreetMap. La cobertura depende de los datos disponibles en cada zona." };
}

function categoryOf(tags = {}) {
  if (tags.amenity === "fuel") return "gasolinera";
  if (tags.shop || tags.amenity === "cafe" || tags.amenity === "ice_cream" || tags.shop === "bakery" || tags.shop === "pastry" || tags.shop === "confectionery") return tags.amenity === "cafe" || tags.amenity === "ice_cream" || ["bakery","pastry","confectionery"].includes(tags.shop) ? "cafe" : "comprar";
  if (["restaurant","bar","pub","fast_food","food_court"].includes(tags.amenity)) return "comer";
  if (["hotel","hostel","guest_house","motel","apartment"].includes(tags.tourism)) return "dormir";
  return "otros";
}

function addressOf(tags) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return [street, tags["addr:postcode"], tags["addr:city"] || tags["addr:town"] || tags["addr:village"]].filter(Boolean).join(", ");
}

function coordinatesOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { lat: element.lat, lng: element.lon };
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) return { lat: element.center.lat, lng: element.center.lon };
  return null;
}

async function requestEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("El servicio de mapas no está disponible temporalmente.");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchNearbyEstablishments(location, radiusKm = 5, category = "all") {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Primero necesitamos una ubicación válida.");
  }
  const radius = Math.max(1, Math.min(30, Number(radiusKm) || 5)) * 1000;
  const selected = category === "all" ? Object.keys(FILTERS) : [category];
  const selectors = selected.flatMap(key => FILTERS[key] || []);
  const query = `[out:json][timeout:25];( ${selectors.map(selector => `${selector}(around:${Math.round(radius)},${location.lat},${location.lng});`).join("")} );out center tags;`;
  let data;
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try { data = await requestEndpoint(endpoint, query); break; }
    catch (error) { lastError = error; }
  }
  if (!data) throw new Error(lastError?.name === "AbortError" ? "La búsqueda está tardando demasiado. Inténtalo de nuevo." : (lastError?.message || "No se ha podido conectar con OpenStreetMap."));
  const unique = new Map();
  for (const element of data.elements || []) {
    const name = element.tags?.name || element.tags?.["name:es"] || element.tags?.brand;
    const coordinates = coordinatesOf(element);
    if (!name || !coordinates) continue;
    const key = `${element.type}-${element.id}`;
    const distance = distanceKm(location, coordinates);
    unique.set(key, {
      id: key, name, category: categoryOf(element.tags), lat: coordinates.lat, lng: coordinates.lng,
      distance, address: addressOf(element.tags), city: element.tags["addr:city"] || element.tags["addr:town"] || element.tags["addr:village"] || "",
      website: element.tags.website || element.tags["contact:website"] || "",
      openingHours: element.tags.opening_hours || "",
      source: "OpenStreetMap"
    });
  }
  return [...unique.values()].filter(place => place.distance <= radiusKm && (category === "all" || place.category === category)).sort((a,b) => a.distance - b.distance);
}
