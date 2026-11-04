# ADR-003: Las posiciones GPS se retransmiten sin pasar por la base de datos y se guardan en lotes cada 5 s

Estado: propuesto

## Contexto

En el pico del almuerzo, 400 repartidores emitiendo cada 5 s generan ~80 eventos/s durante 120 min. El
escenario de `docs/escenario-calidad.md` exige, con esa carga, p95 de retransmisión ≤ 3 s, pérdida ≤ 5 %
y p95 de cobro ≤ 2 s.

Con el código inicial, cada posición ocupaba una conexión antes de retransmitirse. La base simulada
atiende ~66 consultas/s (4 conexiones a 60 ms, supuesto del grupo) y recibe ~82 consultas/s: 80 de
tracking y 2 de la sonda de cobro. La cola crece sin límite mientras dure el pico, y el cobro hace la misma
cola dos veces. Es el riesgo que declara `vision.md`: una ráfaga de tracking degrada los pagos del
monolito modular.

## Decisión

Se aplica una sola táctica, **sacar el trabajo del camino del evento con escritura diferida por lotes**
(`src/moduloTracking.js`):

1. Al recibir una posición, se retransmite de inmediato por el broker, sin esperar a la base de datos.
2. Se conserva en memoria solo la última posición pendiente de cada repartidor, como pide la respuesta
   del escenario, que descarta el histórico intermedio.
3. Cada 5 s se guarda ese conjunto en una sola escritura. El intervalo es el periodo de emisión del GPS:
   si el proceso cae, cada repartidor pierde como máximo la posición que volverá a enviar en ≤ 5 s.

## Alternativas descartadas

- **Ampliar el pool a 6 conexiones, sin táctica.** Es la alternativa más fuerte: **también pasa la
  prueba** (p95 de retransmisión 100 ms, p95 de cobro 398 ms), sin cambiar código y con cada posición
  guardada en unos 100 ms. Se descarta porque deja la base al 82 % de uso (82 de 100 consultas/s) con la
  carga normal del pico, ocupada casi por completo en posiciones efímeras, y ese margen depende del
  supuesto de 60 ms. **Esta decisión debe revisarse** si la latencia real de escritura resulta menor:
  a partir de unos 82 consultas/s de capacidad, el código inicial ya no se satura.
- **Separar las conexiones de tracking y de pagos.** Protegería el cobro, pero el tracking quedaría con
  menos de las 4 conexiones que ya no le alcanzan: su p95 seguiría incumpliendo. No se midió; se descarta
  por ese cálculo de capacidad.
- **Persistir cada posición con una cola y un consumidor.** La retransmisión también dejaría de esperar,
  pero el consumidor seguiría haciendo ~80 escrituras/s sobre una base que atiende ~66: la cola crecería
  en otro lugar. Exige además acotarla, y agrega una pieza más que operar.
- **Emitir el GPS cada 10 s.** Bajaría la carga a 40 eventos/s, por debajo de la capacidad, pero cambia
  la promesa del producto: el mapa del cliente se actualizaría con la mitad de la frecuencia.
- **Extraer el tracking a un servicio aparte.** `vision.md` lo deja como evolución futura. Para v1, más
  piezas que operar no se pagan con el margen delgado a 40.000 pedidos/mes.

## Ventaja

Medido con `npm run escenario:sin-tactica` y `npm test`: 80 eventos/s durante 30 s, con 4 conexiones.

| Medida | Límite | Sin táctica | Con táctica |
|---|---|---|---|
| p95 de retransmisión | ≤ 3.000 ms | 10.138 ms | 18 ms |
| p95 de cobro | ≤ 2.000 ms | 17.884 ms | 351 ms |
| Pérdida de eventos | ≤ 5 % | 0 % | 0 % |
| Consultas a la base | | 2.460 | 66 |
| Tiempo de conexión ocupada | | 147,6 s | 6,4 s |
| Resultado | | Falla | Pasa |

## Costo

| Costo | Sin táctica | Con táctica |
|---|---|---|
| Máximo hasta guardar una posición, sin saturación (8 eventos/s) | 75 ms | 5.096 ms |
| Máximo hasta guardar una posición, en el pico (80 eventos/s) | 10.668 ms (por la cola) | 5.481 ms |
| Posiciones solo en memoria (máximo) | 0 | 400 |
| Líneas de `src/` | | +45 / −10 |

**Fallas nuevas que antes no existían:**

- **Caída del proceso:** se pierden hasta 400 posiciones aún sin guardar. Se recuperan cuando cada
  repartidor vuelve a emitir, en ≤ 5 s. Es un razonamiento, no está probado.
- **Falla al guardar un lote:** el lote ya salió de memoria y el código no lo reintenta, así que esas
  posiciones no se guardan y el error queda sin manejar. Hay que resolverlo antes de producción.
- **Mapa y base pueden diferir:** el cliente puede ver una posición que todavía no está guardada, o que
  nunca se guarde. Quien lea la base puede obtener una posición con hasta ~5,5 s de antigüedad.
- **Varias instancias:** si el monolito escala horizontalmente en el pico, cada instancia tiene sus
  propias pendientes. El código actual no coordina varias instancias.
- **Eventos desordenados:** una posición atrasada puede reemplazar a una más nueva, porque se guarda la
  última en llegar y no la última emitida.

## Cómo se verifica que funciona

`npm test` debe terminar con código 0. La condición de éxito es la medida del escenario, y las constantes
con su origen están al inicio de `test/escenario-gps.test.js`. `npm run escenario:sin-tactica` ejecuta el
mismo camino con el código inicial y debe fallar.

Resultados adicionales: 3 corridas de 30 s con táctica y 1 de 120 s pasaron, con p95 de 18 ms y entre 350
y 352 ms de cobro. La medición depende de la máquina, y 18 ms está cerca de la resolución de los
temporizadores en Windows.

**Lo que esta prueba no demuestra:**

- La base, el broker, la pasarela y los clientes son simulados, y la llamada es en proceso, sin HTTP ni
  AMQP. Falta medir la capacidad real de PostgreSQL: de ese número depende que la táctica sea necesaria.
- No se ejecutaron los 120 min del pico.
- El cobro se sondea a 1 por segundo para tener una muestra de p95, más que los ~4 pedidos por minuto
  del pico.

## Qué queda sin cubrir

- **Una sola verdad del pedido:** propagación ordenada de estados a las tres apps en ≤ 5 s.
- **Recuperación tras desconexión:** estado vigente en ≤ 10 s tras una caída de ≤ 2 min.
- **Otro modo de falla en este mismo camino:** si el broker se detiene, esta táctica no ayuda. La base
  ya no se satura, pero las posiciones no llegan al cliente y la prueba fallaría por pérdida de eventos.
