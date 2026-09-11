**Conclusión**

Sí, es técnicamente viable y puede hacerse de forma segura. La parte sencilla es la plataforma de personalización y generación del PDF. La parte incierta son las integraciones con Groupon y Fever, porque dependen del contrato, permisos y APIs que os concedan.

El repositorio actual está prácticamente vacío: solo contiene `.gitattributes`. No hay arquitectura ni código existente que condicione las decisiones.

**Flujo recomendado**

```text
Shopify / Groupon / Fever
          |
          | webhook, API o importación
          v
Backend PrintMyEscape
          |
          | crea derecho de acceso
          v
Email con enlace seguro
          |
          v
Personalización web
          |
          v
Generación del PDF
          |
          v
Descarga privada y controlada
```

El pago debe seguir estando en el marketplace. Nuestro sistema no debería almacenar tarjetas ni gestionar pagos inicialmente.

**Integraciones**

| Plataforma | Viabilidad inicial | Enfoque |
|---|---:|---|
| Shopify | Alta | App privada o custom app, webhooks de pedidos pagados, reembolsos y cancelaciones |
| Groupon | Condicional | Confirmar acceso al API de pedidos/fulfillment; fallback mediante CSV o panel |
| Fever | Condicional | Necesario acuerdo técnico con Fever; su Reporting API requiere acceso autorizado y no necesariamente sirve como webhook de fulfillment |
| Venta directa futura | Alta | Stripe Checkout o Shopify, sin almacenar datos de tarjeta |

Shopify recomienda verificar la firma HMAC de cada webhook, evitar duplicados mediante el identificador del webhook y ejecutar procesos de reconciliación porque un webhook puede perderse.

Para Groupon y Fever no asumiría que basta con “recibir un email”. Hay que confirmar:

- Si entregan el correo del comprador.
- Cuándo consideran el pedido pagado.
- Si disponen de API, webhook o exportación.
- Cómo notifican reembolsos y cancelaciones.
- Si permiten que un tercero envíe un email al comprador.
- Qué identificador o voucher podemos usar para enlazar el pedido.

**Arquitectura propia**

Recomendaría mantener una plataforma central independiente de los marketplaces:

- Backend API.
- Base de datos PostgreSQL.
- Panel administrativo.
- Servicio de email transaccional.
- Cola de trabajos para generar PDFs.
- Almacenamiento privado de documentos.
- Adaptadores independientes para Shopify, Groupon, Fever y futuras plataformas.

Entidades principales:

- `products`
- `template_versions`
- `orders`
- `entitlements`
- `personalizations`
- `generated_documents`
- `delivery_events`
- `audit_logs`

La pieza importante es `entitlement`: representa el derecho comprado a personalizar y descargar un producto. No debemos confiar en datos enviados por el navegador para determinar si alguien ha comprado.

**Enlace de acceso**

El enlace del correo debería:

- Usar un token aleatorio de alta entropía.
- Guardar únicamente el hash del token en la base de datos.
- Caducar, por ejemplo, en 48 o 72 horas.
- Consumirse una vez para crear una sesión segura.
- Usar cookies `HttpOnly`, `Secure` y `SameSite`.
- Tener protección contra reenvíos, enumeración y abuso.
- No contener el email, nombre ni número de pedido visible.

Importante: un enlace enviado por correo es una credencial tipo “bearer”. Si alguien lo reenvía, quien lo recibe podría usarlo. Para este producto puede ser aceptable porque el comprador probablemente compartirá el escape room con sus amigos, pero hay que decidirlo explícitamente.

El PDF tampoco se puede hacer imposible de copiar. Una vez descargado, puede reenviarse, imprimirse o fotografiarse. El objetivo realista es impedir accesos accidentales o automatizados, no crear DRM perfecto.

**Personalización**

Para el MVP limitaría los datos a:

- Nombres.
- Apodos.
- Relaciones entre jugadores.
- Texto corto.
- Idioma.
- Alguna fecha o localización, si forma parte del diseño.

Evitaría inicialmente:

- Subida de fotografías.
- Datos sensibles.
- Datos de menores.
- HTML introducido por el usuario.
- Personalización generativa mediante IA.

El usuario debería poder:

- Completar el formulario desde móvil.
- Guardar automáticamente un borrador.
- Ver una previsualización.
- Validar longitudes y caracteres.
- Confirmar la versión final.
- Descargar el PDF.
- Volver a descargarlo posteriormente bajo las reglas definidas.

Los templates publicados deben ser inmutables. Si se corrige un diseño, se crea una nueva versión para que los PDFs ya generados no cambien inesperadamente.

**Seguridad mínima exigible**

- Verificación de firma de todos los webhooks.
- Idempotencia por plataforma y pedido.
- Verificación server-side de que el pedido está pagado.
- Reconciliación periódica con cada plataforma.
- Revocación o bloqueo tras reembolso.
- PDFs en almacenamiento privado.
- URLs de descarga firmadas y con caducidad.
- MFA para el panel administrativo.
- Roles separados para administración y soporte.
- Registro de acciones administrativas.
- Rate limiting y protección contra abuso.
- CSP, HSTS y cabeceras de seguridad.
- Gestión de secretos fuera del repositorio.
- Backups y pruebas de restauración.
- Monitorización de errores, emails y generación de documentos.
- SPF, DKIM y DMARC para el dominio de email.

**RGPD**

Si operáis desde España o la UE, debéis diseñar desde el principio conforme a minimización y privacidad por diseño:

- Guardar solo los datos necesarios.
- Definir cuánto tiempo se conservan.
- Cifrar datos y copias de seguridad.
- Tener política de privacidad y términos.
- Formalizar contratos con proveedor de hosting, email y almacenamiento.
- Preparar borrado y exportación de datos.
- No enviar nombres u otros datos a servicios de IA sin una justificación clara.
- Aclarar si el marketplace, el estudio o ambos son responsables del tratamiento.

La Comisión Europea recomienda explícitamente limitar los datos, la accesibilidad y el tiempo de conservación desde el diseño inicial.

**Plan por fases**

1. **Descubrimiento**
   - Confirmar modelo comercial y responsabilidades.
   - Obtener documentación técnica de Shopify, Groupon y Fever.
   - Definir qué significa “una compra”: una personalización, varias descargas o varios grupos.
   - Definir política de reembolso, caducidad y soporte.
   - Inventariar los datos que necesita el escape room.

2. **MVP con Shopify**
   - Una tienda.
   - Un producto.
   - Un template.
   - Un flujo de pedido pagado.
   - Email de acceso.
   - Personalización móvil.
   - Generación y descarga del PDF.
   - Panel mínimo para reenviar enlaces y consultar pedidos.

3. **Endurecimiento**
   - Idempotencia y reintentos.
   - Reconciliación de pedidos.
   - Reembolsos y cancelaciones.
   - Logs y alertas.
   - Backups.
   - Pruebas de seguridad.
   - RGPD y documentación legal.

4. **Groupon y Fever**
   - Implementar únicamente cuando el contrato confirme el flujo técnico.
   - Mantener importación CSV/manual como plan de contingencia.
   - No acoplar el dominio de personalización a una API concreta.

5. **Escalado**
   - Múltiples escape rooms.
   - Idiomas.
   - Versionado de templates.
   - Cupones y promociones.
   - Métricas de conversión.
   - Soporte avanzado.
   - Posible venta directa.

**Recomendación principal**

Construiría primero un vertical slice completo con Shopify. No empezaría por integrar simultáneamente Shopify, Groupon y Fever. El riesgo principal no es generar el PDF, sino coordinar pagos, reembolsos, emails, derechos de acceso y soporte de forma fiable.

Las decisiones que necesitamos cerrar ahora son:

- ¿El usuario personaliza un único escape room o puede crear varias copias?
- ¿Qué campos exactos se personalizan?
- ¿Se permitirán fotografías?
- ¿El comprador podrá descargar de nuevo el PDF?
- ¿El enlace debe poder compartirse libremente?
- ¿Quién envía el email: PrintMyEscape o el marketplace?
- ¿Qué plataformas tienen ya contrato y acceso técnico confirmado?
- ¿El producto será solo para España o desde el inicio internacional?

Con esas respuestas se puede convertir este planteamiento en un documento técnico y un backlog de MVP.