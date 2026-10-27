# Legislación — Estados Unidos

Este documento cita, con artículo, las normas de Estados Unidos que alcanzan a Careonys —HIPAA,
HITECH y las leyes de los estados— y dice para cada una en qué estado está el sistema. Los tres
estados posibles («Cumple», «En obra», «No alcanza») y qué significa cada uno están explicados en
la introducción de `docs/CUMPLIMIENTO_NORMATIVO.md`.

## Protección de datos de salud

### HIPAA — 45 CFR Partes 160 y 164

| Artículo | Qué exige | Estado |
|---|---|---|
| **164.308(b)(1)** y **164.502(e)** | Contrato de business associate con cada proveedor que toque datos de salud, incluido el proveedor de nube | **En obra** — paso 5. Exige nivel de servicio con acuerdo firmado en el proveedor de base de datos |
| **164.312(a)(2)(i)** «Required» | Identificación única de cada persona que accede | **En obra** — paso 125. Es «Required»: una cuenta compartida es incumplimiento sin evaluación de riesgo que valga |
| **164.312(a)(2)(ii)** «Required» | Procedimiento de acceso de emergencia | **En obra** — paso 125 |
| **164.312(a)(2)(iii)** | Cierre de sesión automático | **En obra** — paso 125. Hoy existe sólo para el permiso de acceso de CeltaTech |
| **164.312(a)(2)(iv)** y **164.312(e)(2)(ii)** | Cifrado en reposo y en tránsito, «Addressable» | **Cumple en tránsito** (TLS forzado). **En obra** el resto — paso 13 |
| **164.306(d)(3)** | Lo «Addressable» que no se implementa se documenta por escrito | **En obra** — paso 129 |
| **164.312(b)** | Registro que examine la actividad sobre los sistemas con datos de salud | **En obra** — paso 9. Hoy se registran escrituras, no lecturas |
| **164.308(a)(1)(ii)(D)** «Required» | **Revisar** periódicamente los registros, con constancia | **En obra** — paso 121 |
| **164.308(a)(1)(ii)(A)** | Análisis de riesgos | **En obra** — paso 129, con el Apéndice C de NIST SP 800-66r2, que enumera el acceso entre clientes como amenaza |
| **164.306(a)(2)** | Protección frente a amenazas razonablemente anticipadas | **En obra** — plan de aislamiento completo |
| **164.308(a)(7)(ii)(A)(B)(C)** «Required» | Copia exacta y recuperable, restauración, modo de emergencia | **En obra** — paso 126 |
| **164.308(a)(4)** y mínimo necesario **164.502(b)** | Acceso acotado a lo necesario | **En obra** — plan de aislamiento, tramos 1 a 4 |
| **164.312(d)** | Verificación de identidad de quien accede | **Cumple parcialmente**: entrada con usuario y contraseña, sin segundo factor. La entrada con token está guardada en el estante de CeltaTech (`Codigos-utiles`) — paso 125 |
| **164.410** | El business associate notifica la brecha al covered entity | **En obra** — paso 124, construido para 24 horas |
| **164.402(2)** | Presunción de brecha salvo evaluación de cuatro factores, con carga de la prueba de la empresa | **En obra** — paso 124 |
| **164.404(c)** | Contenido mínimo del aviso, cinco elementos | **En obra** — paso 124 |
| **164.316(b)(2)(i)** | Conservar la documentación seis años | **En obra** — paso 129 |
| **164.504(e)(2)(ii)(J)** | Devolver o destruir los datos al terminar el contrato, alcanzando las copias | **En obra** — paso 122 |

**42 U.S.C. §17941 (HITECH).** El regulador debe considerar las prácticas de seguridad reconocidas
acreditadas **durante no menos de los doce meses anteriores** al incidente. No es puerto seguro y no
impide la sanción, pero es la única palanca real que existe, y lo adoptado después del incidente no
cuenta. **En obra** — paso 129.

**Estados.** Texas exige notificar dentro de los 30 días y avisar al Fiscal General cuando alcanza a
250 residentes. California permite reclamar 1.000 dólares nominales por persona sin probar daño, lo
que convierte cualquier brecha en litigio colectivo viable. **En obra** — paso 124.

**Lo que HIPAA no exige, y por eso no se construye por esta vía:** segundo factor, prueba de
penetración, escaneo de vulnerabilidades, inventario de activos, auditoría anual —el 164.308(a)(8)
dice «periódica» sin definir plazo—, prueba de restauración, plazo o formato del registro de
accesos, ni localización de los datos. Varias de esas cosas están igual en el plan, pero por otras
normas o por el mercado. La ausencia de prescripción no es ausencia de obligación: el auditor juzga
la elección contra el propio análisis de riesgos.

**El proyecto de reglamento de enero de 2025 (90 FR 898) no es ley.** Está en acciones de largo
plazo con fecha proyectada en julio de 2027. No se construye contra él.

## Lo que no se verificó

- **El protocolo de auditoría del regulador estadounidense** no se leyó: la lista de evidencia sale
  del texto reglamentario, no del protocolo.
