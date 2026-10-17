# Con qué software de facturación se conecta Careonys, y cómo

**Por qué existe este documento.** No hay una primera Prestadora todavía, así que no hay un nombre.
El primer software de facturación que se conecte será el que ella elija, si es que no prefiere
cargar a mano o intercambiar una planilla. Entonces, en vez de esperar ese nombre, se miró qué
software se usa en Argentina y cómo se conecta cada uno, para saber **cuánto cuesta agregar el
primero y cuánto cuesta agregar el segundo**.

Relevado en octubre de 2026 contra la documentación pública de cada programa. Lo que no se pudo
comprobar ahí va marcado **[sin verificar]**. La RG ARCA 5866/2026 actualiza el régimen de
facturación electrónica con un cronograma que va de julio de 2026 a marzo de 2027, así que estas
interfaces pueden cambiar: antes de escribir una conexión se vuelve a mirar la del programa elegido.

---

## 1. La conclusión

**Los que tienen interfaz se conectan de la misma forma general y con datos distintos.** Ninguno
obliga a rehacer nada de lo construido. Lo que cambia de uno a otro son tres cosas: con qué
credencial se entra, cómo se llaman los campos, y si el software puede avisar por su cuenta lo que
emitió. Eso es exactamente lo que ya está previsto que sea una pieza por software.

**Varios de los más usados no tienen interfaz pública para emitir**: Bejerman, Holistor, Contagram
y, en la práctica, Finnegans. Para quien use uno de ellos, el camino es el intercambio por archivo
que ya existe.

**Tango, el más usado, es el más incómodo** (sección 3).

**Y hay un límite que vale para todos:** Careonys no guarda con qué número se identifica
fiscalmente quien paga, y no lo va a guardar. Eso es dato de facturación puro, y lo tiene quien
factura, en su propio padrón de clientes. Careonys le dice a quién cobrarle y cuánto; con qué
número figura esa persona ante el organismo fiscal es asunto del software de facturación.

---

## 2. Cuáles se usan en Argentina

No hay ningún ranking ni cuota de mercado oficial. El orden sale de la prensa, de guías
comparativas que escriben vendedores y de cifras que declara cada proveedor sobre sí mismo.

| # | Programa | Evidencia | Peso |
|---|---|---|---|
| 1 | **Tango (Axoft)** | Vela LatAm compró el 100 % de Axoft en octubre de 2026, y la operación lo describe como uno de los sistemas de gestión más usados del país ([Bruchou & Funes](https://bruchoufunes.com/?p=35162)). Terceros estiman más de 60.000 clientes **[sin verificar]** | Seguro el primero |
| 2 | **Xubio** | Las guías lo presentan como el más popular entre pymes y monotributistas. Sin cifras | Alto entre los chicos |
| 3 | **Colppy** | Aparece en todas las guías para pymes. Sin cifras | Alto entre los chicos |
| 4 | **Bejerman** (Thomson Reuters) | Nombrado junto a Tango para empresas medianas. Sin cifras | Medio-alto |
| 5 | **Holistor** | Declara más de 90.000 licencias vendidas; orientado a estudios contables | Medio |
| 6 | **Contabilium** | Aparece en guías para pymes. Sin cifras | Medio |
| 7 | **Alegra** | Fuerte en otros países de la región | Medio-bajo |
| 8 | **TusFacturasAPP** | Orientado a facturar por interfaz | Bajo en volumen, alto entre integradores |
| 9 | **Odoo** con localización argentina | Creciendo, según vendedores de software a medida. Sin cifras | En crecimiento |
| 10 | **Finnegans** | Gestión en la nube para empresas medianas. Sin cifras | Medio-bajo |
| 11 | **Contagram** | Declara más de 2.500 empresas | Bajo |
| 12 | **Facturante** | Sólo factura. Sin cifras | Bajo |
| 13 | **Sistemas 360** | Sólo factura, por interfaz. Sin cifras | Bajo |

Las guías nombran también **Bind** y **Holded**, que no se relevaron **[sin verificar]**.

---

## 3. Cómo se conecta cada uno

«Avisa solo» es que el programa llama por su cuenta a una dirección de Careonys cuando emite algo
(webhook).

| Programa | Emite por interfaz | Cómo se entra | Avisa solo lo emitido | Ambiente de prueba | Devuelve el CAE |
|---|---|---|---|---|---|
| **Tango Factura** | Sí | Usuario, contraseña y secreto de la aplicación, que se cambian por un pase | **No**: sólo avisa cambios de stock | Mencionado; cómo se obtiene **[sin verificar]** | **No documentado** |
| **Tango Gestión** | **No**: sólo entrega lo ya emitido | Pase que llega por correo | **Sí** | Empresa de ejemplo de Tango | Sí |
| **Xubio** | Sí | Credencial de dos partes que se cambia por un pase de una hora | No documentado | No documentado | **[sin verificar]** |
| **Colppy** | Sí, todo por una sola dirección | Usuario y contraseña, que dan una clave de sesión. La contraseña viaja con un cálculo débil (MD5) | No documentado | **Sí**, se le pide al equipo de Colppy | **[sin verificar]** |
| **Contabilium** | Sí, sólo desde el plan Full | Una clave generada en la cuenta; si son dos partes **[sin verificar]** | No documentado | No documentado | **[sin verificar]** |
| **Alegra** | Sí, sólo en el plan Plus | Correo y clave de la cuenta | **Sí** | No; 15 días de prueba gratis | **[sin verificar]** |
| **TusFacturasAPP** | Sí | Tres claves de la cuenta | **Sí** | Un plan de prueba en la propia cuenta | Sí |
| **Facturante** | Sí, con un protocolo más antiguo (SOAP) | Usuario, contraseña y empresa | **Sí** | **Sí**, separado y sin certificado | Sí |
| **Sistemas 360** | Sí | Una clave; ella decide si es prueba o producción | **No** | **Sí**, simulado y sin certificado | Sí |
| **Odoo** | Sí, en la nube sólo en planes Custom | Clave de hasta 3 meses | Hay que armarlo con reglas automáticas | Sí | Sí; nombre del campo **[sin verificar]** |
| **Finnegans** | Tiene, pero la documentación exige iniciar sesión | **[sin verificar]** | **[sin verificar]** | **[sin verificar]** | **[sin verificar]** |
| **Bejerman** | No encontrada | — | — | — | — |
| **Holistor** | No encontrada | — | — | — | — |
| **Contagram** | No encontrada | — | — | — | — |

**Lo que tienen en común los que emiten:** reciben los pedidos por el mismo mecanismo de siempre
—el que usa cualquier página de internet para hablar con otra— y devuelven, de una vez o en dos
tiempos, lo que Careonys necesita anotar: cómo se llama el comprobante, qué número le tocó y el
código de autorización del organismo fiscal (CAE).

**Lo que cambia:** el nombre de cada campo y la forma de la credencial. Eso es traducción, y es
poco trabajo por software. **Ninguno obliga a tocar a los demás**, que es la condición que el plan
ya tenía escrita.

**Tango.** Son dos productos distintos de la misma empresa, y ninguno hace las dos mitades:

- **Tango Factura** emite, pero su documentación no muestra que devuelva el CAE ni el número, y no
  avisa nada sobre facturas.
- **Tango Gestión** no emite: entrega lo que ya se emitió, con el CAE, y avisa cuando hay algo
  nuevo.

Una Prestadora con Tango Gestión factura adentro de Tango, y Careonys recibiría lo emitido por el
segundo camino **[sin verificar]**. Tango publica además una interfaz para mandarle pedidos de venta
(TangoDeltaApi), por la que podría entrar lo que hay que facturar; no se relevó.

**Tres emiten en dos tiempos:** Facturante, TusFacturasAPP y Tango Factura. El CAE no llega en la
respuesta al pedido: llega después, por aviso o por consulta.

---

## 4. Los dos sentidos, y en cuál estamos

**De Careonys hacia el software de facturación** —«cobrale tanto a este Cliente»—. Es la mitad que
falta, y es la que hay que escribir una vez por software. Hoy ese mismo pedido sale en un archivo
que alguien baja y entrega.

**Del software de facturación hacia Careonys** —«emití este comprobante, con este número, por este
importe»—. Esta mitad **ya está construida, probada y publicada**, y es una sola para todos.

> **Ningún software de facturación comprado firma su aviso**, según su propia documentación.
> Careonys tiene su forma de comprobar que un pedido es auténtico, y quien programe a medida la
> puede seguir —para eso está `docs/CONEXION_CON_SOFTWARE_EXTERNO.md`—, pero un producto ya hecho
> avisa a su manera. El que más se acerca es TusFacturasAPP, que manda en el encabezado
> `TF-WebhookToken` un valor fijo que identifica al remitente, sin probar que el contenido no se
> alteró.

De ahí sale que la pieza por software tiene **dos mitades chicas** en vez de una: traducir el
pedido de ida, y recibir lo que vuelve como ese software lo mande. **El aviso de un software
comprado se toma sólo como señal de que algo cambió**: antes de anotar, Careonys consulta el
comprobante en ese software. Las dos mitades terminan escribiendo en el mismo lugar de siempre
(`backend/src/utils/anotarLoFacturado.js`), así que el resto del producto no se entera de por cuál
entró.

---

## 5. Lo que falta, y no depende de cuál se elija

**Falta que los dos lados sepan que están hablando de la misma persona.** Hoy, lo que sale hacia el
software de facturación es: de qué Cliente es la factura, de qué período, en qué moneda, por cuánto y para cuándo
(`panel/src/lib/intercambioDeFacturacion.js`, `COLUMNAS_QUE_SALEN`).

Con el archivo a mano eso alcanza, porque quien lo carga reconoce a sus clientes por el nombre.
**Con conexión directa no alcanza**, porque no hay nadie del otro lado que reconozca nada: el
software recibe un nombre y tiene que saber a cuál de sus clientes corresponde.

Lo que falta entonces **no es el dato fiscal, es la correspondencia**: que cada Cliente de Careonys
se corresponda con el cliente que el software de facturación ya tiene cargado. Una referencia, y
nada más. El número de identificación fiscal, la condición frente al organismo y qué clase de
comprobante corresponde viven del otro lado, que es donde se factura.

Cada programa la resuelve distinto: Tango Factura acepta un código propio del cliente, Sistemas 360
una referencia externa, Alegra y Odoo piden el identificador del cliente en su propio padrón, y
Facturante no tiene código de cliente y obliga a corresponder por número de documento.

---

## 6. Qué se hace, entonces

1. **Resolver cómo se corresponde cada Cliente de Careonys con el cliente del otro lado.** Es lo único que la
   conexión directa necesita y hoy no existe.
2. **Esperar a la primera Prestadora** para escribir la pieza de su software. Antes de eso, escribir
   una es elegir a ciegas y acertar con suerte.
3. **Si esa Prestadora usa un software que avisa solo lo que emitió** —TusFacturasAPP, Facturante,
   Alegra o Tango Gestión—, la mitad de vuelta es todavía menos trabajo, porque la parte que anota
   ya está hecha.
4. **Si usa uno sin interfaz** —Bejerman, Holistor, Contagram—, no hay pieza que escribir: sigue con
   el intercambio por archivo.

---

## 7. Ficha de cada programa

### Tango Factura

- Documentación: https://www.tangofactura.com/Help. El dominio redirige a tfactura.io, que hoy
  muestra una página casi vacía; la documentación sigue respondiendo en la dirección de arriba.
- Emite con `POST /Services/Facturacion/CrearFactura` (y `CrearFacturaA`, `B`, `C`). La autorización
  ante ARCA es otro método, `AutorizarMovimiento`.
- Se entra pidiendo un pase a `/Provisioning/GetAuthToken` con `UserName`, `Password` y `UserSecret`,
  que salen de la aplicación creada en la cuenta. Cada pedido lleva `Token`, `UserIdentifier` y
  `ApplicationPublicKey`. Cuánto dura el pase no está documentado.
- `CrearFactura` devuelve `MovimientoId`, estado, fechas y totales. **No documenta CAE, número ni
  tipo.** `ObtenerInfoMovimiento` tampoco los trae en su respuesta documentada.
- Cliente receptor: `ClienteCodigo` (hasta 10 caracteres), `ClienteTipoDocumento` y
  `ClienteNumeroDocumento`.
- Sólo avisa cambios de stock. Precio no publicado.

### Tango Gestión

- Documentación: https://github.com/TangoSoftware/ApiClientes. Pide Tango Gestión 18.01 o superior,
  Tango Sync y Nexo Clientes.
- No emite. Entrega en JSON los comprobantes que ya tienen CAE: tipo, número, punto de venta, CAE
  con su vencimiento, totales y documento del comprador.
- Avisa a una dirección configurada, con el formato `Id_cliente/Id_comprobante`. Se consulta con
  `getjsonfrom`, `getnotdownloadedjsonfrom` y `getjson`.
- Se entra con un pase que llega por correo y va en un encabezado. Se prueba vinculando una empresa
  de ejemplo de Tango.

### Xubio

- Documentación: https://xubio.com/API/documentation/index.html
- Se entra con identificador y secreto, que se cambian por un pase de una hora en
  `/API/1.1/TokenEndpoint`. Las claves se crean en Configuración → Integraciones → API de Xubio.
- Qué devuelve al emitir no se pudo leer sin sesión **[sin verificar]**.

### Colppy

- Documentación: https://apidocs.colppy.com/
- Todo entra por `login.colppy.com/lib/frontera2/service.php`, en un JSON con `auth`, `service` y
  `parameters`. El inicio de sesión da una clave de sesión para los pedidos siguientes.
- Ambiente de prueba en `staging.colppy.com`, que se pide por el chat de la plataforma. Hay una
  colección pública en Postman.

### Contabilium

- Documentación: https://ayuda.contabilium.com/hc/es/articles/360013444234
- La clave se genera en Mi cuenta → Configuración → API → Credenciales; regenerarla invalida la
  anterior en el acto. La lista de métodos no se pudo abrir.

### Alegra

- Documentación: https://developer.alegra.com/
- En Argentina se emite con `stamp.generateStamp=true` y las fechas del período del servicio, que es
  justo el caso de Careonys.
- Avisa con los eventos `new-invoice`, `new-client` y `new-item`, a una dirección HTTPS que tiene
  que contestar en menos de 5 segundos; después de 10 fallos seguidos, la suscripción se borra sola.
- El cliente receptor se identifica por su número dentro de Alegra, que hay que crear antes.
- Interfaz incluida sólo en el plan Plus, $109.999 por mes sin IVA, sin cargo aparte.

### TusFacturasAPP

- Documentación: https://developers.tusfacturas.app/
- Se entra con `apitoken`, `apikey` y `usertoken`.
- Avisa los eventos `encolado`, `emitido`, `error`, `eliminado`, `cambio_fecha` y `test`, con
  reintentos hasta 12 horas, y manda `TF-WebhookToken` en el encabezado. Se configura por punto de
  venta.
- Se prueba con el plan «API DEV» de la propia cuenta, que no vuelve una vez vinculada con ARCA.
- Desde $34.980 por mes por 1.000 pedidos.

### Facturante

- Documentación: https://www.facturante.com/developers/apidoc
- Protocolo SOAP. Ambiente de prueba separado en testing.facturante.com, sólo HTTP.
- `CrearComprobante` responde sólo con un identificador; `DetalleComprobante` trae después CAE,
  vencimiento, número, punto de venta, tipo y total.
- Avisa cuando ARCA autoriza, en formulario, XML o JSON.
- El cliente receptor va adentro de cada comprobante, sin código propio.
- Desde $6.355 + IVA por mes.

### Sistemas 360

- Documentación: https://api.sistemas360.ar/en/api-documentation
- No avisa: se consulta con `GET /api/comprobantes/{id}`.
- Devuelve `tipo_comprobante`, `punto_venta`, `numero_comprobante`, `cae`, `cae_vencimiento` e
  `importes.total`. Acepta una `referencia_externa` por cliente.

### Odoo con localización argentina

- Documentación: https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations/argentina.html
- Se crea la factura y se la valida; el módulo `l10n_ar_edi` pide el CAE.
- XML-RPC y JSON-RPC se retiran en Odoo Online 21.1 y en Odoo 22: una conexión nueva va por la
  interfaz que los reemplace.

---

## 8. Lo que no se pudo verificar

Hace falta una cuenta o una consulta al proveedor:

1. **Tango Factura:** si devuelve el CAE y el número, y dónde; cuánto dura el pase; cómo se obtiene
   una empresa de prueba; el precio.
2. **Xubio, Colppy, Contabilium, Alegra y Odoo:** en qué campo devuelven el CAE y el número.
3. **Contabilium:** si la clave es una sola o de dos partes.
4. **Finnegans:** la ficha entera.
5. **Bind y Holded:** si tienen peso en Argentina y cómo se conectan.
