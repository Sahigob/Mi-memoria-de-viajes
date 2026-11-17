// La búsqueda de establecimientos reales se conectará en una fase posterior.
// Se mantiene separada de los lugares personales para no mezclar recuerdos con sugerencias.
export function discoveryStatus() {
  return {
    ready: false,
    message: "La búsqueda de establecimientos nuevos se conectará después de validar esta primera versión."
  };
}
