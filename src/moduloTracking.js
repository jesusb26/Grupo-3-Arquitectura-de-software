const claveDe = (repartidorId) => `ubicacion.${repartidorId}`;

// Cada posición se guarda en la base de datos antes de retransmitirse.
export function crearModuloTracking({ baseDeDatos, broker }) {
  return {
    async recibirUbicacion(evento) {
      await baseDeDatos.consultar();
      broker.publicar(claveDe(evento.repartidorId), evento);
    },
    suscribirCliente(repartidorId, manejador) {
      broker.suscribir(claveDe(repartidorId), manejador);
    },
  };
}
