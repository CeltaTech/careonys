import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useLocale } from '../../i18n/LocaleContext';
import { usePrestadoraActual } from '../../hooks/usePrestadoraActual';
import { supabase } from '../../lib/supabaseClient';
import { claseBadge } from '../../lib/tonos';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EstadoLista } from '../../components/layout/EstadoLista';
import { mensajeDeError } from '../../lib/errores';
import '../../styles/molde-paginas.css';
import '../hojaDeTarjetas.css';

export function CertificadoTab({ asistente }) {
  const { t, locale } = useLocale();
  const prestadoraId = usePrestadoraActual();
  const [certificado, setCertificado] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    setError(null);
    const { data, error: errorConsulta } = await supabase
      .from('certificados')
      .select('*')
      .eq('asistente_id', asistente.id)
      .order('fecha_emision', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errorConsulta) {
      setError(mensajeDeError(errorConsulta, t));
      setEstado('error');
      return;
    }
    setCertificado(data);
    if (data && asistente.qr_token) {
      setQrDataUrl(await QRCode.toDataURL(asistente.qr_token, { width: 280, margin: 1 }));
    }
    setEstado('listo');
  }, [asistente.id, asistente.qr_token, t]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function emitirCertificado() {
    setEmitiendo(true);
    setError(null);
    const { error: errorInsert } = await supabase.from('certificados').insert({
      prestadora_id: prestadoraId,
      asistente_id: asistente.id,
      fecha_emision: new Date().toISOString().slice(0, 10),
    });
    setEmitiendo(false);
    if (errorInsert) {
      setError(t.comun.error_generico);
      return;
    }
    recargar();
  }

  const etapasCompletas = asistente.estado === 'activo';

  return (
    <section className="panel-tarjeta">
      <div className="panel-tarjeta-titulo">
        <h2>{t.asistentes.certificado.titulo}</h2>
        {certificado && (
          <span className={claseBadge(certificado.activo ? 'activo' : 'inactivo')}>
            {certificado.activo ? t.asistentes.certificado.estado_activo : t.asistentes.certificado.estado_inactivo}
          </span>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      <EstadoLista estado={estado} error={error} vacio={false} recargar={recargar}>
        {certificado ? (
          <>
            <div className="panel-grilla panel-columnas-3">
              <div className="hoja-dato">
                <div className="panel-mini">{t.asistentes.certificado.fecha_emision}</div>
                <b>{new Date(certificado.fecha_emision).toLocaleDateString(locale)}</b>
              </div>
              {certificado.fecha_vencimiento && (
                <div className="hoja-dato">
                  <div className="panel-mini">{t.asistentes.certificado.fecha_vencimiento}</div>
                  <b>{new Date(certificado.fecha_vencimiento).toLocaleDateString(locale)}</b>
                </div>
              )}
            </div>
            {qrDataUrl && (
              <>
                <img src={qrDataUrl} alt={t.asistentes.certificado.titulo} width={280} height={280} />
                <div className="molde-acciones">
                  <a href={qrDataUrl} download={`certificado-${asistente.id}.png`}>
                    <Button variant="secondary">{t.asistentes.certificado.descargar_qr}</Button>
                  </a>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {!etapasCompletas && <Alert variant="info">{t.asistentes.certificado.requiere_activo}</Alert>}
            <div className="molde-acciones">
              <Button onClick={emitirCertificado} disabled={emitiendo || !etapasCompletas}>
                {emitiendo ? t.comun.guardando : t.asistentes.certificado.emitir}
              </Button>
            </div>
          </>
        )}
      </EstadoLista>
    </section>
  );
}
