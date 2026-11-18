import { distanceKm } from "./location.js";

// Instancias públicas gratuitas de Overpass con cobertura europea/global.
// Se usan en orden para no lanzar varias consultas simultáneas.
const ENDPOINTS = [
  "https://ovp.dresel.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter"
];

const FILTERS = {
  comer: [
    'nwr["amenity"~"^(restaurant|bar|pub|fast_food|food_court)$"]["name"]'
  ],
  cafe: [
    'nwr["amenity"~"^(cafe|ice_cream)$"]["name"]',
    'nwr["shop"~"^(bakery|pastry|confectionery)$"]["name"]'
  ],
  dormir: [
    'nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]["name"]'
  ],
  comprar: [
    'nwr["shop"]["name"]'
  ],
  gasolinera: [
    'nwr["amenity"="fuel"]["name"]'
  ],
  otros: [
    'nwr["tourism"~"^(museum|attraction|zoo|theme_park|gallery)$"]["name"]'
  ]
};

export function discoveryStatus() {
  return {
    ready: true,
    message: "Busca establecimientos próximos mediante OpenStreetMap. La disponibilidad depende de los datos cartográficos de cada zona."
  };
}

function categoryOf(tags = {}) {
  if (tags.amenity === "fuel") return "gasolinera";
  if (tags.amenity === "cafe" || tags.amenity === "ice_cream" ||
      ["bakery", "pastry", "confectionery"].includes(tags.shop)) return "cafe";
  if (tags.shop) return "comprar";
  if (["restaurant", "bar", "pub", "fast_food", "food_court"].includes(tags.amenity)) return "comer";
  if (["hotel", "hostel", "guest_house", "motel", "apartment"].includes(tags.tourism)) return "dormir";
  return "otros";
}

function addressOf(tags = {}) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  return [
    street,
    tags["addr:postcode"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"]
  ].filter(Boolean).join(", ");
}

function coordinatesOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

async function requestEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json"
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Servidor " + response.status);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.elements)) {
      throw new Error("Respuesta de mapa no válida");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchNearbyEstablishments(location, radiusKm = 5, category = "all") {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Primero necesitamos una ubicación válida. Activa el GPS e inténtalo de nuevo.");
  }

  const safeRadiusKm = Math.max(1, Math.min(30, Number(radiusKm) || 5));
  const radius = Math.round(safeRadiusKm * 1000);
  const selected = category === "all" ? Object.keys(FILTERS) : [category];
  const selectors = selected.flatMap(key => FILTERS[key] || []);

  if (!selectors.length) {
    throw new Error("La categoría seleccionada no es válida.");
  }

  // Una consulta compacta: solo elementos con nombre y un máximo de 100 resultados.
  const query = [
    "[out:json][timeout:9];",
    "(",
    selectors.map(selector =>
      selector + "(around:" + radius + "," + location.lat + "," + location.lng + ");"
    ).join("\n"),
    ");",
    "out center tags 100;"
  ].join("\n");

  let data = null;
  const errors = [];

  for (const endpoint of ENDPOINTS) {
    try {
      data = await requestEndpoint(endpoint, query);
      break;
    } catch (error) {
      errors.push(error?.name === "AbortError" ? "tiempo agotado" : (error?.message || "error de conexión"));
    }
  }

  if (!data) {
    throw new Error(
      "No han respondido los servidores gratuitos de OpenStreetMap (" +
      errors.join("; ") +
      "). Comprueba tu conexión y vuelve a intentarlo en unos instantes."
    );
  }

  const unique = new Map();

  for (const element of data.elements) {
    const tags = element.tags || {};
    const name = tags.name || tags["name:es"] || tags.brand;
    const coordinates = coordinatesOf(element);

    if (!name || !coordinates) continue;

    const distance = distanceKm(location, coordinates);
    if (distance > safeRadiusKm) continue;

    const placeCategory = categoryOf(tags);
    if (category !== "all" && placeCategory !== category) continue;

    const key = element.type + "-" + element.id;
    unique.set(key, {
      id: key,
      name,
      category: placeCategory,
      lat: coordinates.lat,
      lng: coordinates.lng,
      distance,
      address: addressOf(tags),
      city: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "",
      website: tags.website || tags["contact:website"] || "",
      openingHours: tags.opening_hours || "",
      source: "OpenStreetMap"
    });
  }

  return [...unique.values()].sort((a, b) => a.distance - b.distance);
}
