// Lee el pedido, cobra y guarda el resultado. Usa las mismas conexiones que el tracking.
export function crearModuloPagos({ baseDeDatos, pasarela }) {
  return {
    async cobrar(pedidoId) {
      await baseDeDatos.consultar();
      const resultado = await pasarela.cobrar(pedidoId);
      await baseDeDatos.consultar();
      return resultado;
    },
  };
}
