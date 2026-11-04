const claveDe = (repartidorId) => `ubicacion.${repartidorId}`;

// Con escritura diferida, la posición se retransmite sin pasar por la base de datos y solo se
// guarda la última de cada repartidor, en un lote cada 5 s (el periodo de emisión del GPS).
// Con escrituraDiferida: false cada posición ocupa una conexión antes de retransmitirse.
export function crearModuloTracking({ baseDeDatos, broker, escrituraDiferida = true, intervaloLoteMs = 5000 }) {
  let pendientes = new Map();
  const metricas = { maxPendientes: 0, maxMsHastaGuardar: 0 };

  function registrarGuardado(evento) {
    metricas.maxMsHastaGuardar = Math.max(metricas.maxMsHastaGuardar, Date.now() - evento.emitidoEn);
  }

  async function guardarLote() {
    if (pendientes.size === 0) return;
    const lote = pendientes;
    pendientes = new Map();
    await baseDeDatos.consultar(lote.size);
    for (const evento of lote.values()) registrarGuardado(evento);
  }

  const temporizador = escrituraDiferida ? setInterval(guardarLote, intervaloLoteMs) : null;

  return {
    metricas,
    async recibirUbicacion(evento) {
      if (escrituraDiferida) {
        pendientes.set(evento.repartidorId, evento);
        metricas.maxPendientes = Math.max(metricas.maxPendientes, pendientes.size);
      } else {
        await baseDeDatos.consultar();
        registrarGuardado(evento);
      }
      broker.publicar(claveDe(evento.repartidorId), evento);
    },
    suscribirCliente(repartidorId, manejador) {
      broker.suscribir(claveDe(repartidorId), manejador);
    },
    async detener() {
      clearInterval(temporizador);
      await guardarLote();
    },
  };
}
