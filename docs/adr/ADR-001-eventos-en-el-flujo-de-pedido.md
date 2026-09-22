# ADR-001: La confirmación del comercio, la asignación de repartidor y el aviso al cliente van por evento

Estado: borrador

## Decisión

De los cuatro pasos del flujo de pedido, tres van por evento: la confirmación del comercio, la
asignación del repartidor y el aviso final al cliente. Solo el cobro se mantiene síncrono.

- **Confirmar con el restaurante** va por evento porque la tableta del comercio tiene
  conectividad precaria y puede estar minutos fuera de línea (restricción explícita del caso).
  El pedido se publica y el comercio responde cuando puede, dentro de una ventana de expiración;
  si no responde, el pedido se cancela solo.
- **Asignar repartidor** va por evento porque puede requerir
  varios intentos de oferta y reasignación hasta que alguien acepte. Bloquear al cliente
  esperando ese proceso no es aceptable en el pico del almuerzo.
- **Avisar al cliente** va por evento porque es una notificación pura: nadie necesita que ese
  paso termine para saber que su acción anterior funcionó.

El cobro se queda síncrono porque el cliente necesita la confirmación inmediata de que su pago
fue aceptado antes de que el sistema siga comprometiendo recursos (buscar restaurante y
repartidor con un pedido que nunca se pagó).

## Alternativa descartada

Hacer todo síncrono: el flujo completo como una sola cadena de request/response, desde que el
cliente confirma el pedido hasta que el repartidor queda asignado.

Habríamos ganado una sola pieza que operar (sin broker, sin colas) y la certeza de que el
cliente nunca ve un pedido "a medias": si la respuesta llegó, todo el flujo ya ocurrió. A
cambio, con las fuerzas de este caso, esa cadena se rompe en el primer eslabón: la tableta del
comercio puede estar sin señal varios minutos, y una petición síncrona esperando esa respuesta
dejaría al cliente colgado en el pico del almuerzo, justo la ventana que concentra el 35% del
volumen y que el caso no puede permitirse perder. Además, la asignación de repartidor puede
necesitar varias vueltas de oferta/rechazo; encadenar eso de forma síncrona multiplicaría la
espera del cliente por cada reintento.

## Consecuencias negativas

- Una pieza más que operar y monitorear: el broker de eventos.
- Consistencia eventual entre las tres apps: el cliente puede ver "confirmando con el
  restaurante..." por varios segundos (o minutos, si el comercio tarda) en vez de una respuesta
  inmediata de todo el flujo.
- Cada consumidor (comercio, servicio de asignación, notificador) debe ser idempotente, porque
  el broker entrega al menos una vez; esa memoria de idempotencia (ids de pedido, de
  transacción, de asignación) hay que persistirla.
- Aparecen casos de compensación que no existían en la versión síncrona: si nadie acepta el
  pedido tras varios intentos de asignación, hay que reembolsar un cobro que ya se hizo, no solo
  responder con un error.
- El pedido pasa por más estados intermedios visibles (pendiente de confirmación, pagado,
  buscando repartidor) que las tres apps deben saber representar de forma consistente.
