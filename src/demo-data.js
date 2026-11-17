export const categories = {
  comer: { label: "Comer", icon: "♨" },
  cafe: { label: "Desayunar", icon: "☕" },
  dormir: { label: "Dormir", icon: "⌂" },
  comprar: { label: "Comprar", icon: "▤" },
  gasolinera: { label: "Gasolinera", icon: "⛽" },
  otros: { label: "Otros", icon: "＋" }
};

// Datos completamente ficticios, solo para probar la interfaz.
export const demoPlaces = [
  { id:"demo-1", name:"Casa Montaña", category:"comer", city:"Valencia", address:"Carrer de Josep Benlliure, Valencia", lat:39.4652, lng:-0.3332, rating:"like", notes:"Ejemplo: sitio tradicional que merece la pena recordar.", date:"2026-03-12" },
  { id:"demo-2", name:"Café de las Horas", category:"cafe", city:"Valencia", address:"Carrer del Comte d'Almodóvar, Valencia", lat:39.4764, lng:-0.3751, rating:"like", notes:"Ejemplo: buen sitio para desayunar tranquilamente.", date:"2026-04-08" },
  { id:"demo-3", name:"Hotel de ejemplo", category:"dormir", city:"Valencia", address:"Centro de Valencia", lat:39.4698, lng:-0.3763, rating:"ok", notes:"Alojamiento de demostración. No es una recomendación real.", date:"2026-02-19" },
  { id:"demo-4", name:"Centro comercial de ejemplo", category:"comprar", city:"Valencia", address:"Zona de Valencia", lat:39.4542, lng:-0.3504, rating:"ok", notes:"Ficha ficticia para probar la categoría de compras.", date:"2026-01-25" },
  { id:"demo-5", name:"Panadería de ejemplo", category:"cafe", city:"Madrid", address:"Madrid, España", lat:40.4168, lng:-3.7038, rating:"like", notes:"Ejemplo guardado en otra ciudad.", date:"2026-05-02" }
];
