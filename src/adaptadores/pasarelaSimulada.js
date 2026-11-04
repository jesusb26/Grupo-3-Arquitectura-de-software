// Simula la pasarela de pagos externa, que aquí siempre aprueba: la falla de este escenario
// no está en la pasarela, sino en la base de datos compartida.
export function crearPasarelaSimulada({ latenciaMs = 200 } = {}) {
  return {
    cobrar(pedidoId) {
      return new Promise((resolver) => {
        setTimeout(() => resolver({ pedidoId, estado: 'aprobada' }), latenciaMs);
      });
    },
  };
}
