import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';
import { crearBaseDeDatosSimulada } from '../src/adaptadores/baseDeDatosSimulada.js';
import { crearBrokerSimulado } from '../src/adaptadores/brokerSimulado.js';
import { crearPasarelaSimulada } from '../src/adaptadores/pasarelaSimulada.js';
import { crearModuloPagos } from '../src/moduloPagos.js';
import { crearModuloTracking } from '../src/moduloTracking.js';

// Medida del escenario (docs/escenario-calidad.md).
const P95_TRACKING_MS = 3000; // ADR-000 y vision.md, Escenario 1
const P95_PAGO_MS = 2000; // SLA de pago, vision.md, Escenario 1
const PERDIDA_MAXIMA = 0.05; // vision.md, Escenario 1

const REPARTIDORES = 400; // vision.md: 400 repartidores activos
const CLIENTES_POR_REPARTIDOR = 5; // vision.md: ~2.000 clientes / 400 repartidores
const TASA_EVENTOS = Number(process.env.TASA_EVENTOS ?? 80); // 400 repartidores / 5 s
const DURACION_S = Number(process.env.DURACION_S ?? 30); // Ventana comprimida del pico de 120 min
const TASA_PAGOS = 1; // Sonda: 1 cobro/s para tener una muestra de p95 en la ventana
const ESCRITURA_DIFERIDA = process.env.TACTICA !== 'off';
const DB_CONEXIONES = Number(process.env.DB_CONEXIONES ?? 4); // Supuesto del grupo

function p95(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.ceil(ordenados.length * 0.95) - 1];
}

// Ritmo calculado sobre el reloj para no acumular la imprecisión de los temporizadores.
async function emitirDuranteLaVentana(tasa, duracionS, emitir) {
  const total = tasa * duracionS;
  const inicio = Date.now();
  let emitidos = 0;
  while (emitidos < total) {
    const debidos = Math.min(total, Math.floor(((Date.now() - inicio) / 1000) * tasa));
    while (emitidos < debidos) emitir(emitidos++);
    await esperar(20);
  }
  return emitidos / ((Date.now() - inicio) / 1000);
}

test('rastreo GPS en el pico: p95 ≤ 3 s, ≥ 80 eventos/s, pérdida ≤ 5 % y cobro p95 ≤ 2 s', { timeout: 300_000 }, async () => {
  const baseDeDatos = crearBaseDeDatosSimulada({ conexiones: DB_CONEXIONES });
  const tracking = crearModuloTracking({
    baseDeDatos,
    broker: crearBrokerSimulado(),
    escrituraDiferida: ESCRITURA_DIFERIDA,
  });
  const pagos = crearModuloPagos({ baseDeDatos, pasarela: crearPasarelaSimulada() });

  const latenciasTracking = [];
  const latenciasPago = [];
  for (let repartidorId = 0; repartidorId < REPARTIDORES; repartidorId++) {
    for (let cliente = 0; cliente < CLIENTES_POR_REPARTIDOR; cliente++) {
      tracking.suscribirCliente(repartidorId, (evento) => {
        latenciasTracking.push(Date.now() - evento.emitidoEn);
      });
    }
  }

  const pendientes = [];
  const [tasaEmitida] = await Promise.all([
    emitirDuranteLaVentana(TASA_EVENTOS, DURACION_S, (n) => {
      const evento = { repartidorId: n % REPARTIDORES, emitidoEn: Date.now() };
      pendientes.push(tracking.recibirUbicacion(evento));
    }),
    emitirDuranteLaVentana(TASA_PAGOS, DURACION_S, (n) => {
      const inicio = Date.now();
      pendientes.push(pagos.cobrar(`pedido-${n}`).then(() => latenciasPago.push(Date.now() - inicio)));
    }),
  ]);

  // Se espera a que todo termine para medir la latencia real, aunque la cola siga atrasada.
  await Promise.all(pendientes);
  await tracking.detener();
  await esperar(100);

  const esperadas = TASA_EVENTOS * DURACION_S * CLIENTES_POR_REPARTIDOR;
  const perdida = 1 - latenciasTracking.length / esperadas;
  const p95Tracking = p95(latenciasTracking);
  const p95Pago = p95(latenciasPago);

  console.log(`Táctica: ${ESCRITURA_DIFERIDA ? 'escritura diferida' : 'sin táctica'}, ${DB_CONEXIONES} conexiones`);
  console.log(`Carga: ${TASA_EVENTOS} eventos/s durante ${DURACION_S} s (emitidos: ${tasaEmitida.toFixed(1)}/s)`);
  console.log(`p95 retransmisión: ${p95Tracking} ms (máximo ${P95_TRACKING_MS} ms)`);
  console.log(`p95 cobro: ${p95Pago} ms (máximo ${P95_PAGO_MS} ms)`);
  console.log(`Pérdida: ${(perdida * 100).toFixed(2)} % (máximo ${PERDIDA_MAXIMA * 100} %)`);
  console.log(`Costo: hasta ${tracking.metricas.maxMsHastaGuardar} ms para guardar una posición`);
  console.log(`Costo: hasta ${tracking.metricas.maxPendientes} posiciones solo en memoria`);
  const { consultas, msOcupada } = baseDeDatos.estadisticas;
  console.log(`Base de datos: ${consultas} consultas, ${(msOcupada / 1000).toFixed(1)} s de conexión ocupada`);

  const incumplidas = [];
  // Confirma que la carga se aplicó; el 1 % cubre la imprecisión de los temporizadores.
  if (tasaEmitida < TASA_EVENTOS * 0.99) incumplidas.push(`carga emitida ${tasaEmitida.toFixed(1)}/s < ${TASA_EVENTOS}/s`);
  if (p95Tracking > P95_TRACKING_MS) incumplidas.push(`p95 retransmisión ${p95Tracking} ms > ${P95_TRACKING_MS} ms`);
  if (p95Pago > P95_PAGO_MS) incumplidas.push(`p95 cobro ${p95Pago} ms > ${P95_PAGO_MS} ms`);
  if (perdida > PERDIDA_MAXIMA) incumplidas.push(`pérdida ${(perdida * 100).toFixed(2)} % > 5 %`);
  assert.deepEqual(incumplidas, []);
});
