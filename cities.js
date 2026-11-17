export function groupPlacesByCity(places) {
  const groups = new Map();
  for (const place of places) {
    const city = (place.city || "Sin ciudad").trim();
    groups.set(city, (groups.get(city) || 0) + 1);
  }
  return [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0], "es"));
}
