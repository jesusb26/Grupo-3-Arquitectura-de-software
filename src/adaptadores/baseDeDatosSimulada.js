// Simula PostgreSQL: un pool con pocas conexiones y una cola FIFO cuando todas están ocupadas.
// Supuesto del grupo: 4 conexiones a 60 ms por consulta (~66 consultas/s), una instancia pequeña
// acorde con el margen delgado por pedido.
export function crearBaseDeDatosSimulada({ conexiones = 4, latenciaMs = 60 } = {}) {
  const enEspera = [];
  let ocupadas = 0;

  function atender() {
    while (ocupadas < conexiones && enEspera.length > 0) {
      const terminar = enEspera.shift();
      ocupadas++;
      setTimeout(() => {
        ocupadas--;
        terminar();
        atender();
      }, latenciaMs);
    }
  }

  return {
    consultar() {
      return new Promise((resolver) => {
        enEspera.push(resolver);
        atender();
      });
    },
  };
}
