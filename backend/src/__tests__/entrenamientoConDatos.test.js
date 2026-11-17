import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { llamadasDeEntrenamiento } from '../../../scripts/verificar_entrenamiento_con_datos.mjs';

/* El control que corta la publicación si algo entrena un modelo de IA. Lo que se prueba es que
   falle cuando debe: un control que siempre da verde no protege nada. Cada prueba arma una
   carpeta de mentira con el código que hace falta y le pasa el control por encima. */

const CONTROL = fileURLToPath(new URL('../../../scripts/verificar_entrenamiento_con_datos.mjs', import.meta.url));

let carpetas = [];
function repoDePrueba(archivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'entrenamiento-'));
  carpetas.push(raiz);
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completa = join(raiz, ruta);
    mkdirSync(join(completa, '..'), { recursive: true });
    writeFileSync(completa, contenido);
  }
  return raiz;
}
const correrElControl = (raiz) => spawnSync(process.execPath, [CONTROL, '--raiz', raiz], { encoding: 'utf8' });

before(() => { carpetas = []; });
after(() => { for (const c of carpetas) rmSync(c, { recursive: true, force: true }); });

const LLAMADA_DE_IA = "const r = await anthropic.messages.create({ model, messages });\n";

describe('el control de entrenamiento con datos', () => {
  it('corta la publicación con un ajuste fino de OpenAI en el backend', () => {
    const raiz = repoDePrueba({
      'backend/src/utils/entrenar.js': LLAMADA_DE_IA + "await openai.fineTuning.jobs.create({ training_file: archivo.id });\n",
    });
    const salida = correrElControl(raiz);
    assert.equal(salida.status, 1);
    assert.match(salida.stderr, /backend\/src\/utils\/entrenar\.js:2/);
  });

  it('caza cada proveedor, en cualquier parte que se publique', () => {
    const casos = {
      'backend/a.js': "client.fine_tuning.jobs.create({})",
      'backend/b.js': "fetch('https://api.openai.com/v1/files', { body: { purpose: 'fine-tune' } })",
      'panel/src/c.js': "await genai.tunedModels.create({ baseModel })",
      'backend/d.js': "await vertex.tuningJobs.create({ baseModel })",
      'backend/e.js': "await bedrock.send(new CreateModelCustomizationJobCommand({ baseModelIdentifier }))",
      'backend/f.js': "await sagemaker.send(new CreateTrainingJobCommand({}))",
      'supabase/g.sql': "select net.http_post('https://api.mistral.ai/v1/fine_tuning/jobs', '{}');",
      '.github/workflows/h.yml': "run: autotrain llm --train --data-path datos",
    };
    const hallados = llamadasDeEntrenamiento(repoDePrueba(casos)).map((h) => h.ruta).sort();
    assert.deepEqual(hallados, Object.keys(casos).sort());
  });

  it('deja pasar el código que sólo le pregunta al modelo', () => {
    const raiz = repoDePrueba({ 'backend/src/utils/alertas.js': LLAMADA_DE_IA });
    const salida = correrElControl(raiz);
    assert.equal(salida.status, 0, salida.stderr);
  });

  it('no cuenta comentarios, documentación ni pruebas', () => {
    const raiz = repoDePrueba({
      'backend/src/a.js': "// acá nunca se hace fineTuning.jobs.create\n" + LLAMADA_DE_IA,
      'docs/NORMAS.md': "Prohibido fineTuning.jobs.create con datos de las Prestadoras.",
      'backend/src/__tests__/x.test.js': "openai.fineTuning.jobs.create({})",
    });
    assert.deepEqual(llamadasDeEntrenamiento(raiz), []);
  });

  it('el repositorio de verdad hoy no tiene ninguna', () => {
    const salida = spawnSync(process.execPath, [CONTROL], { encoding: 'utf8' });
    assert.equal(salida.status, 0, salida.stderr);
  });
});
