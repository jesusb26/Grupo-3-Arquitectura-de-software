workspace "Domicilios locales" {
    model {
        cliente = person "Cliente" "Arma el pedido, paga y rastrea"
        comercio = person "Comercio" "Acepta y prepara pedidos"
        repartidor = person "Repartidor" "Recibe asignaciones y entrega"

        domicilios = softwareSystem "Plataforma de domicilios" {
            appCliente = container "App cliente" "Arma el pedido y rastrea la entrega" "App movil" "Mobile"
            appComercio = container "App comercio" "Tableta para aceptar y preparar pedidos" "App movil" "Mobile"
            appRepartidor = container "App repartidor" "Recibe ofertas de pedido y reporta posicion" "App movil" "Mobile"
            api = container "API de pedidos" "Crea el pedido, orquesta el flujo" "Node.js"
            db = container "Base de datos" "Persiste pedidos, estados e idempotencia" "PostgreSQL" "Database"
            broker = container "Broker de eventos" "Distribuye los eventos del pedido" "RabbitMQ" "Broker"
            asignacion = container "Servicio de asignacion" "Empareja el pedido con un repartidor disponible, reasigna si no aceptan" "Node.js"
            notificador = container "Notificador" "Envia notificaciones push a las tres apps" "Node.js"
        }

        pasarela = softwareSystem "Pasarela de pagos" "Externo, cobra en linea" "External"
        proveedorLLM = softwareSystem "Proveedor del modelo de lenguaje" "Externo. Interpreta el texto libre del pedido y propone un carrito (ADR-002)" "External"

        cliente -> appCliente "Arma y confirma el pedido"
        appCliente -> api "Envia texto libre del pedido para interpretar" "HTTPS" "Synchronous"
        api -> db "Lee menu del comercio y ultimo pedido del cliente" "SQL" "Synchronous"
        api -> proveedorLLM "Texto + menu del comercio; recibe carrito propuesto" "HTTPS, sincrono, timeout 4 s, sin reintento" "Synchronous"
        appCliente -> api "Crea el pedido (carrito confirmado por el cliente)" "HTTPS" "Synchronous"
        api -> db "Guarda el pedido" "SQL" "Synchronous"
        api -> pasarela "Cobra (si es en linea)" "HTTPS, con timeout" "Synchronous"

        api -> broker "Publica PedidoCreado" "AMQP" "Asynchronous"
        broker -> appComercio "Entrega el evento, pide confirmacion" "AMQP, con expiracion" "Asynchronous"
        comercio -> appComercio "Acepta o rechaza el pedido"
        appComercio -> api "Responde la confirmacion (o expira)" "HTTPS" "Synchronous"
        api -> db "Actualiza estado: confirmado" "SQL" "Synchronous"

        api -> broker "Publica PedidoConfirmado" "AMQP" "Asynchronous"
        broker -> asignacion "Entrega el evento" "AMQP" "Asynchronous"
        asignacion -> appRepartidor "Oferta el pedido" "push, con timeout y reasignacion" "Asynchronous"
        repartidor -> appRepartidor "Acepta la oferta"
        appRepartidor -> asignacion "Confirma la aceptacion" "HTTPS" "Synchronous"
        asignacion -> db "Actualiza estado: repartidor asignado" "SQL" "Synchronous"

        asignacion -> broker "Publica RepartidorAsignado" "AMQP" "Asynchronous"
        broker -> notificador "Entrega el evento" "AMQP" "Asynchronous"
        notificador -> appCliente "Avisa que hay repartidor asignado" "push" "Asynchronous"

        // Camino del escenario de calidad: rastreo GPS en el pico (docs/escenario-calidad.md)
        appRepartidor -> api "Reporta posicion GPS cada 5 s (~80 eventos/s en el pico)" "HTTPS" "Synchronous"
        api -> db "Guarda en lote cada 5 s la ultima posicion de cada repartidor (ADR-003)" "SQL" "Asynchronous"
        api -> broker "Publica UbicacionActualizada" "AMQP" "Asynchronous"
        broker -> appCliente "Retransmite la posicion a los clientes suscritos" "AMQP" "Asynchronous"
    }

    views {
        container domicilios {
            include *
            autoLayout lr
        }

        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "External" {
                background #999999
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Mobile" {
                shape MobileDevicePortrait
                background #85bbf0
                color #000000
            }
            element "Database" {
                shape Cylinder
                background #2e6da4
                color #ffffff
            }
            element "Broker" {
                shape Pipe
                background #6b6ecf
                color #ffffff
            }
            relationship "Synchronous" {
                color #1168bd
                dashed false
            }
            relationship "Asynchronous" {
                color #d79b00
                dashed true
            }
        }
    }
}
