import { useEffect, useRef } from 'react';

// Un texto editable con marcadores que no se escriben ni se borran a mano. Cada `{{clave}}` del
// texto se dibuja como una etiqueta con lo que va a decir de verdad —el nombre de la Prestadora, la
// palabra «Paciente»—, y quien edita escribe alrededor sin ver nunca las llaves. Lo que sale por
// `onChange` es otra vez el texto con las llaves, que es lo que se guarda.
//
// `etiquetas` dice qué mostrar por cada clave. Una clave que no figura ahí queda como texto común.

function escapar(texto) {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function aHtml(valor, etiquetas) {
  return String(valor ?? '')
    .split(/(\{\{\w+\}\})/g)
    .map((pedazo) => {
      const clave = pedazo.match(/^\{\{(\w+)\}\}$/)?.[1];
      if (clave && etiquetas[clave] != null) {
        return `<span contenteditable="false" data-marcador="${clave}" class="badge badge-neutro">${escapar(etiquetas[clave])}</span>`;
      }
      return escapar(pedazo).replace(/\n/g, '<br>');
    })
    .join('');
}

function aTexto(nodo) {
  let texto = '';
  nodo.childNodes.forEach((hijo) => {
    if (hijo.nodeType === Node.TEXT_NODE) {
      texto += hijo.textContent;
    } else if (hijo.nodeName === 'BR') {
      texto += '\n';
    } else if (hijo.dataset?.marcador) {
      texto += `{{${hijo.dataset.marcador}}}`;
    } else if (hijo.nodeName === 'DIV' || hijo.nodeName === 'P') {
      // Algunos navegadores parten el renglón en bloques en vez de poner un salto.
      if (texto && !texto.endsWith('\n')) texto += '\n';
      texto += aTexto(hijo);
    } else {
      texto += aTexto(hijo);
    }
  });
  return texto;
}

export function TextoConMarcadores({ value, onChange, etiquetas, id, ...resto }) {
  const caja = useRef(null);
  const ultimo = useRef(null);

  // Sólo se redibuja cuando el valor cambia desde afuera: redibujar lo que la persona acaba de
  // escribir le movería el cursor al principio.
  useEffect(() => {
    if (!caja.current || value === ultimo.current) return;
    caja.current.innerHTML = aHtml(value, etiquetas);
    ultimo.current = value;
  }, [value, etiquetas]);

  function alCambiar() {
    const texto = aTexto(caja.current);
    ultimo.current = texto;
    onChange(texto);
  }

  function alApretar(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  }

  function alPegar(e) {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  }

  return (
    <div
      ref={caja}
      id={id}
      className="texto-con-marcadores"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      onInput={alCambiar}
      onKeyDown={alApretar}
      onPaste={alPegar}
      {...resto}
    />
  );
}
