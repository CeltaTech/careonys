import { HiloComunicacion } from '../../components/comunicacion/HiloComunicacion';

export function ComunicacionTab({ asistente }) {
  return <HiloComunicacion asistenteId={asistente.id} />;
}
