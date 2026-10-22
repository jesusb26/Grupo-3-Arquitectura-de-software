# Escenarios y tácticas — Caso 3: Domicilios locales

Taller de la Semana 7 (Tácticas de calidad) · Grupo 3

## Paso 1 — Los tres que mandan

Retomamos los atributos fijados en el ADR-000, sin cambios: **rendimiento** (latencia de
retransmisión GPS), **consistencia eventual** (convergencia de estado entre las tres apps) y
**tolerancia a fallos** (recuperación tras desconexión).

Lo que sí aparece con este taller es un **candidato a cuarto atributo, acotado a una sola
función**: costo por conversación, si se agrega el asistente de soporte por IA del Escenario 3.
No sustituye a los tres anteriores — solo manda dentro del alcance de esa función nueva, porque
nace de la misma restricción de margen delgado por pedido que ya tenía el caso, aplicada ahora a
una llamada a un modelo que se cobra por token.

## Paso 2 — Tres escenarios completos

### Escenario A — Tiempo real que no arruine 

| Parte | Contenido |
|---|---|
| Fuente | Los 400 repartidores activos (sus apps emitiendo GPS) |
| Estímulo | Emiten ubicación cada 5 s de forma concurrente → ~80 eventos/s agregados, mientras ~2.000 clientes observan sus mapas en simultáneo |
| Artefacto | El canal de ingestión y distribución de ubicaciones |
| Entorno | Operación normal en el pico del almuerzo, carga máxima sostenida (2 horas) |
| Respuesta | El sistema ingiere las ubicaciones, retiene solo la última posición por repartidor y la retransmite únicamente a los clientes suscritos a ese pedido |
| Medida | 95% de las actualizaciones en ≤3 s, sosteniendo ≥80 eventos/s durante 120 min, sin que la latencia p95 del flujo de pago supere su SLA de 2 s |

### Escenario B — Pasarela de pagos caída en el pico

| Parte | Contenido |
|---|---|
| Fuente | La pasarela de pagos (sistema externo) |
| Estímulo | Deja de responder durante el pico del almuerzo |
| Artefacto | El paso de cobro dentro de la API de pedidos |
| Entorno | Operación normal, 35% del volumen mensual concentrado en esa ventana de 2 horas |
| Respuesta | El sistema detecta la falta de respuesta sin dejar al cliente esperando indefinidamente; si reintenta, nunca cobra dos veces; si no se recupera, el pedido pasa a «pago fallido» sin bloquear la app |
| Medida | Respuesta clara en ≤3 s desde que se detecta la falla; 0 cobros duplicados; el pedido no queda nunca en estado indefinido |

### Escenario C — Asistente de soporte por IA 

Decisión de alcance: el LLM se usa **solo** para responder preguntas de seguimiento y procesar
reembolsos simples por chat. Se descarta explícitamente para asignación de repartidor y para el
cobro — esas rutas siguen siendo deterministas, porque ahí un error no es un mal rato, es dinero
o seguridad del flujo.

| Parte | Contenido |
|---|---|
| Fuente | Un cliente escribiéndole al asistente de soporte |
| Estímulo | Pide un reembolso o información de su pedido; puede incluir un intento de manipular al modelo (p. ej. un comentario adjunto que le pida ignorar el tope de reembolso) |
| Artefacto | El asistente y las herramientas que puede invocar (`consultar_pedido`, `reembolsar`) |
| Entorno | Operación normal; el costo por conversación debe caber dentro del margen por pedido |
| Respuesta | El modelo solo puede proponer una herramienta de una lista permitida; el monto del reembolso lo calcula el código a partir del pedido real, nunca lo que el modelo escriba; reembolsos sobre un tope los decide una persona |
| Medida | 0 reembolsos indebidos en un conjunto de 50 casos de prueba (al menos 45/50 aciertos); costo por conversación ≤ un techo fijado por el margen del negocio |

## Paso 3 — Priorizar

| Escenario | Importancia | Dificultad |
|---|---|---|
| A — GPS en tiempo real | Alta | Alta |
| B — Pasarela caída | Alta | Alta |
| C — Asistente de IA | Media | Alta |

A y B son igual de altas en ambos ejes porque las dos tocan directamente el negocio (la promesa
del producto, y el dinero). C es media en importancia porque, con la misma prueba del
cuestionario («si se quita, ¿el sistema sigue teniendo sentido?»), el asistente no es esencial:
el flujo de pedido existe sin él.

## Paso 4 — Dos tácticas por escenario

### Escenario A — GPS en tiempo real

- **Sacar trabajo del camino del usuario** (publicar en el broker y responder de inmediato).
  Compra: la retransmisión de posiciones no bloquea la creación de pedidos ni el cobro — igual
  que sacar el correo del camino en el ejemplo de la boletería. Cobra: una pieza más que operar
  (el broker), y si algún consumidor se atrasa, su cola puede crecer sin fin si no se acota.
- **Caché de la última posición por repartidor** (en memoria, no se va a la base por cada evento).
  Compra: responder al mapa del cliente sin pagar una consulta a la base de datos en cada uno de
  los 80 eventos/s. Cobra: si el proceso de ingestión se reinicia, se pierde esa última posición
  a menos que se persista aparte — el mismo trade-off de consistencia que la caché de la
  cartelera.

**Choque declarado:** la táctica de gestionar recursos para el tracking (más réplicas, más
memoria para la caché) compite por el mismo runtime compartido que usa el camino síncrono de
pago — es exactamente el riesgo ya escrito en el ADR-000 ("una ráfaga de tracking podría
degradar los pagos"), y la medida de este mismo escenario ya lo declara explícito al incluir el
SLA de pagos como parte de lo que no se puede romper.

### Escenario B — Pasarela caída

- **Timeout + degradación.** Compra: una respuesta clara en ≤3 s aunque la pasarela no responda.
  Cobra: aparece un estado nuevo, «pago fallido» o «pendiente», que alguien (un reconciliador)
  debe resolver después.
- **Reintento idempotente** (clave de idempotencia = id de pedido/transacción). Compra: fallas
  pasajeras de red se resuelven solas, sin que el cliente note nada. Cobra: latencia en el peor
  caso — cada intento suma tiempo al total.

**Choque declarado:** tres intentos de 2 s más esperas de backoff pueden sumar más de 7 s, y el escenario exige ≤3 s. La salida es la
misma que se enseñó: timeout corto (1 s) y un solo reintento, dejando el peor caso en ~2,4 s; si
ni así responde, el pedido pasa a «pago fallido» en vez de seguir esperando.

### Escenario C — Asistente de IA

- **Autorizar en la herramienta, no en el prompt + tope con persona.** Compra: 0 reembolsos
  indebidos sin importar lo que el modelo escriba, porque el monto siempre sale del pedido real
  guardado en el sistema, nunca de un argumento que el modelo propone. Cobra: una capa de
  validación en cada herramienta, y los reembolsos grandes requieren que una persona intervenga,
  lo cual es más lento que una respuesta automática.
- **Limitar vueltas + validar la salida** (citas obligatorias, números con respaldo en los
  fragmentos recuperados). Compra: acota el costo por conversación y evita que el modelo invente
  un plazo o una política que no existe. Cobra: falsos positivos — una respuesta correcta puede
  bloquearse si el modelo no cita bien su fuente.

**Choque declarado:** limitar vueltas y tokens para controlar el costo por conversación puede
chocar con dar una respuesta completa y bien fundamentada a una pregunta larga del cliente. El
techo de vueltas no es un número arbitrario: sale del margen por pedido.

## Paso 5 — Cómo se comprueba (fitness function)

Se elige el **Escenario A** como el más importante: es el primero que lista el propio ADR-000 y
es la promesa diferencial del producto, no solo una pieza operativa.

```js
// fitness/tracking-latencia.test.js
// Genera carga sintética de ~80 eventos/s durante una ventana corta,
// y en paralelo simula el camino de pago para verificar que no se degrada.

test("p95 de retransmisión GPS bajo carga de pico no supera 3 s, sin degradar pagos", async () => {
  const resultadosTracking = [];
  const resultadosPago = [];

  const cargaTracking = generarEventosGPS({ tasa: 80, duracionS: 60 })
    .map(async (evento) => {
      const inicio = Date.now();
      await enviarUbicacion(evento);
      resultadosTracking.push(Date.now() - inicio);
    });

  const cargaPago = generarPagosSimulados({ tasa: 1, duracionS: 60 })
    .map(async (pago) => {
      const inicio = Date.now();
      await cobrarSimulado(pago);
      resultadosPago.push(Date.now() - inicio);
    });

  await Promise.all([...cargaTracking, ...cargaPago]);

  assert.ok(p95(resultadosTracking) <= 3000, "p95 tracking excede 3 s");
  assert.ok(p95(resultadosPago) <= 2000, "p95 pago excede su SLA de 2 s");
});
```

Qué protege: no solo que el tracking cumpla su propio número, sino que cumplirlo no le quite el
SLA al pago — el choque exacto que se declaró en el Paso 4. Esta prueba corre en el pipeline cada
vez que se toca el canal de tracking o se cambia la forma de escalar el monolito, y es la que
haría evidente, antes de producción, si una extracción pendiente del módulo (la mitigación ya
declarada en el ADR-000) dejó de ser opcional.
