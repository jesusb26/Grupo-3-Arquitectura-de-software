// Simula RabbitMQ: entrega cada mensaje solo a los suscriptores de su clave.
export function crearBrokerSimulado({ latenciaMs = 5 } = {}) {
  const suscriptores = new Map();

  return {
    suscribir(clave, manejador) {
      if (!suscriptores.has(clave)) suscriptores.set(clave, []);
      suscriptores.get(clave).push(manejador);
    },
    publicar(clave, mensaje) {
      setTimeout(() => {
        for (const manejador of suscriptores.get(clave) ?? []) manejador(mensaje);
      }, latenciaMs);
    },
  };
}
