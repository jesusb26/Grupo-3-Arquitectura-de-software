# ADR-000 — Visión y atributos de calidad rectores de la plataforma de domicilios
- **Estado:** Aceptado

## Problema de negocio

Coordinar en tiempo casi real a clientes, comercios y repartidores para que ~40.000 pedidos/mes fluyan desde el pedido hasta la entrega, con un pico diario predecible (35 % en las 2 horas del almuerzo), márgenes delgados por pedido y dispositivos/conectividad precarios. Tres aplicaciones sobre un mismo pedido que deben contar la misma historia.

## Qué está en juego si funciona mal

- **Si el estado no se propaga** (se rompe la «única verdad»): domicilios fríos en el mostrador, las tres partes descoordinadas, clientes sin saber dónde está su pedido → pérdida de confianza y fuga de comercios.
- **Si no absorbe el pico:** caídas justo cuando entra el 35 % del volumen, la ventana más rentable → pedidos e ingresos perdidos.
- **Si el costo de infraestructura por pedido es alto:** el margen delgado se evapora → negocio inviable.

## Atributos de calidad que mandan el diseño

1. **Rendimiento (latencia de retransmisión):** el flujo GPS es la promesa del producto y la mayor presión sobre la infraestructura. Se exige que el 95 % de las actualizaciones de ubicación se reflejen en la pantalla del cliente en ≤ 3 s, sosteniendo una carga de ~80 eventos/s.
2. **Consistencia eventual (tiempo de convergencia):** la coordinación de las tres apps es el núcleo del negocio. El sistema debe garantizar que el 99 % de los cambios de estado (como «listo para recoger») se propaguen a las tres apps en ≤ 5 s, asegurando 0 inversiones de orden en la secuencia lógica del pedido.
3. **Tolerancia a fallos (recuperación ante desconexión):** comercios y repartidores operan con datos móviles precarios. El sistema debe tolerar la desconexión garantizando que, tras recuperar la señal (≤ 2 min de caída), la aplicación del repartidor sincronice y recupere el estado vigente de la orden en ≤ 10 s sin bloquear al comercio productor.

## Decisión

Adoptar esos tres atributos como criterios de priorización; v1 como monolito modular con el canal de tracking preparado para extraerse; pagos síncronos, propagación de estado y notificaciones asíncronas por cola. Las decisiones caras de revertir (modelo de eventos de estado, frontera de pagos) se toman con cuidado; el resto, barato de cambiar.