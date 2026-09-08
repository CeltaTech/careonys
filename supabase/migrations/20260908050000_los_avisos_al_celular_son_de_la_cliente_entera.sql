-- Los avisos al celular son del Cliente entera, no solamente del titular.
--
-- Qué estaba mal. La fila que guarda a qué aparato mandarle los avisos se comparaba contra la
-- persona que inició sesión (`cliente_id = auth.uid()`). Para el titular eso funciona de casualidad:
-- el identificador de un Cliente es el mismo que el de su titular. Para quien está anotado en el
-- personas autorizadas y no es el titular, no: se suscribía a los avisos y no recibía ninguno, porque
-- su fila quedaba archivada con una clave que después nadie busca —los avisos se mandan al
-- identificador del Cliente, no al de cada persona—.
--
-- El arreglo del lado del motor está en `backend/src/routes/appClientes.js`, que ahora guarda la
-- suscripción a nombre del Cliente. Esta migración pone la política de acuerdo con eso: la
-- segunda red tiene que decir lo mismo que la puerta, o el día que la aplicación consulte con el
-- pase de la persona vuelve el mismo problema por el otro lado.
--
-- `interno.cliente_id_de_usuario` resuelve el Cliente de quien entró, sea el titular o alguien de
-- su personas autorizadas, y es la misma función que ya usan las políticas de Pacientes, reportes, alertas y
-- guardias.

-- Las suscripciones que ya se guardaron mal se corrigen acá. Sin esto, el arreglo del motor sólo
-- alcanza a quien se vuelva a suscribir: los aparatos ya registrados por alguien de las personas autorizadas
-- seguirían archivados bajo su identificador de persona y no recibirían nada.
UPDATE public.push_subscriptions p
   SET cliente_id = m.cliente_id
  FROM public.miembros_cliente m
 WHERE p.cliente_id = m.usuario_id;

DROP POLICY IF EXISTS cliente_gestiona_sus_push_subscriptions ON public.push_subscriptions;

CREATE POLICY cliente_gestiona_sus_push_subscriptions ON public.push_subscriptions
  FOR ALL
  USING (cliente_id = interno.cliente_id_de_usuario(auth.uid()))
  WITH CHECK (cliente_id = interno.cliente_id_de_usuario(auth.uid()));

NOTIFY pgrst, 'reload schema';
