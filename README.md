# Domicilios locales: rastreo GPS en el pico del almuerzo

Grupo 3 · Arquitectura de Software · UFPS · 2026-II

## Escenario

Con 400 repartidores emitiendo cada 5 s (~80 eventos/s) en el pico del almuerzo, el 95 % de las posiciones
debe llegar al cliente en ≤ 3 s, con pérdida ≤ 5 % y sin que el p95 del cobro supere 2 s. Es el primer
atributo del ADR-000 y el único escenario en el que una ráfaga puede degradar otro flujo: el cobro.

El detalle y los escenarios descartados están en [docs/escenario-calidad.md](docs/escenario-calidad.md).
La táctica y su costo están en el [ADR-003](docs/adr/ADR-003-escritura-diferida-del-tracking-gps.md).

## Cómo ejecutar la prueba

Requiere Node.js 20.6 o superior. No hay dependencias que instalar.

```bash
npm run escenario:sin-tactica   # Con la falla: pico sobre el código inicial. La prueba falla.
npm test                        # Sin la falla: pico con la táctica aplicada. La prueba pasa.
```

Como control, `npm run escenario:sin-pico` ejecuta el código inicial con 8 eventos/s y pasa. Cada ejecución
tarda entre 30 y 45 s.

## Documentos

- [ADR-000](docs/adr/ADR-000-vision-y-atributos-de-calidad.md): visión y atributos de calidad
- [ADR-001](docs/adr/ADR-001-eventos-en-el-flujo-de-pedido.md): eventos en el flujo del pedido
- [ADR-002](docs/adr/ADR-002-pedido-desde-texto-libre-con-modelo.md): modelo de lenguaje y secuencia de su falla
- [ADR-003](docs/adr/ADR-003-escritura-diferida-del-tracking-gps.md): táctica aplicada y costo
- [Vista de contenedores](docs/contenedores.dsl) e [imagen](docs/img/Contenedores.png): el camino del escenario
  está identificado con las flechas en rojo

## Video de sustentación

Enlace: **PENDIENTE**

## Quién hizo qué

| Parte | Integrante |
|---|---|
| Escenario y camino en la vista de contenedores | **Jesús David Barrera Montes** |
| ADR-002 y proveedor del modelo en la vista | **Jesús David Barrera Montes** |
| Código y prueba del escenario | **Deisler Said Prado Ospina** |
| Táctica, medición de costo y ADR-003 | **Deisler Said Prado Ospina** |
