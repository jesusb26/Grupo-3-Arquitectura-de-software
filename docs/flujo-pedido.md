# Flujo: Pedido (confirmar → cobrar → asignar repartidor → avisar al cliente)

Caso 3 — Domicilios locales · Grupo 3

## Paso 1 — El flujo

1. Confirmar con el restaurante (Comercio)
2. Cobrar (Pasarela de pagos)
3. Asignar repartidor (Servicio de asignación)
4. Avisar al cliente (Notificador)

## Paso 2 — Decisión paso por paso

| Paso | Quién | Síncrono o evento | Si falla | Si se repite |
|---|---|---|---|---|
| Confirmar con el restaurante | Comercio | Evento con expiración | Al vencer el timeout (p. ej. 3 min) el pedido se cancela solo; como aún no se ha cobrado, no hay nada que compensar, solo notificar al cliente | Idempotente por id de pedido: el comercio solo puede responder una vez; una respuesta duplicada o tardía tras el timeout se ignora |
| Cobrar | Pasarela de pagos | Síncrono, con timeout (se omite si es contra entrega) | No se asigna repartidor; el pedido queda en «pago fallido» y se pide reintentar | Idempotente por id de transacción: un reintento reusa el mismo id, la pasarela no cobra dos veces |
| Asignar repartidor | Servicio de asignación | Evento, con timeout y reasignación al siguiente repartidor cercano | Si tras N intentos nadie acepta, se compensa el cobro (reembolso si fue en línea) y se alerta a soporte de operaciones | Idempotente por id de pedido: solo un repartidor puede quedar asignado a la vez (lock de asignación); una segunda aceptación se rechaza |
| Avisar al cliente | Notificador | Evento | Se reintenta el envío; si sigue fallando se alerta a soporte, pero no bloquea el pedido | Idempotente por id de evento: notificaciones duplicadas no cambian el estado que ve el cliente |

## Razonamiento

- El paso 1 no puede ser síncrono: la tableta del comercio tiene conectividad precaria y puede
  estar minutos fuera de línea (restricción del caso). Forzar request/response ahí cancelaría
  pedidos válidos solo por lentitud del comercio en responder.
- El cobro se mantiene síncrono porque el cliente necesita saber de inmediato si su pago pasó,
  antes de que el sistema siga comprometiendo recursos (buscar repartidor).
- La asignación es por evento por la misma razón que RF-04 del caso: puede necesitar varios
  intentos de oferta/reasignación, y bloquear al cliente esperando eso no es viable.
- Avisar al cliente es notificación pura: nadie queda bloqueado esperando que esa notificación
  se entregue.
