import { describe, expect, it } from 'vitest';
import { vistaDelEnlace, vistaDelArchivo } from '../vistaDelMaterial';

describe('cómo se ve adentro un enlace', () => {
  it('YouTube, en todas sus formas, va al reproductor que no deja rastro', () => {
    for (const enlace of [
      'https://www.youtube.com/watch?v=abcDEF12345',
      'https://youtu.be/abcDEF12345',
      'https://m.youtube.com/watch?v=abcDEF12345&t=30',
      'https://www.youtube.com/shorts/abcDEF12345',
      'https://www.youtube.com/embed/abcDEF12345',
    ]) {
      expect(vistaDelEnlace(enlace), enlace).toEqual({
        forma: 'marco',
        src: 'https://www.youtube-nocookie.com/embed/abcDEF12345',
      });
    }
  });

  it('Vimeo va a su reproductor, con la clave de un video no listado', () => {
    expect(vistaDelEnlace('https://vimeo.com/123456').src).toBe('https://player.vimeo.com/video/123456');
    expect(vistaDelEnlace('https://vimeo.com/123456/abc123').src).toBe('https://player.vimeo.com/video/123456?h=abc123');
  });

  it('Drive y Documentos de Google van a su vista previa', () => {
    expect(vistaDelEnlace('https://drive.google.com/file/d/ID_1-x/view?usp=sharing').src).toBe(
      'https://drive.google.com/file/d/ID_1-x/preview',
    );
    expect(vistaDelEnlace('https://drive.google.com/open?id=ID_2').src).toBe('https://drive.google.com/file/d/ID_2/preview');
    expect(vistaDelEnlace('https://docs.google.com/spreadsheets/d/ID_3/edit#gid=0').src).toBe(
      'https://docs.google.com/spreadsheets/d/ID_3/preview',
    );
  });

  it('por la extensión: imagen, video, PDF y Office publicado', () => {
    expect(vistaDelEnlace('https://ejemplo.invalido/foto.JPG').forma).toBe('imagen');
    expect(vistaDelEnlace('https://ejemplo.invalido/clase.mp4').forma).toBe('video');
    expect(vistaDelEnlace('https://ejemplo.invalido/guia.pdf')).toEqual({ forma: 'marco', src: 'https://ejemplo.invalido/guia.pdf' });
    expect(vistaDelEnlace('https://ejemplo.invalido/planilla.xlsx').src).toBe(
      'https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fejemplo.invalido%2Fplanilla.xlsx',
    );
  });

  it('lo que no se reconoce, o no es una dirección cifrada, se abre aparte', () => {
    for (const enlace of [
      'https://ejemplo.invalido/pagina',
      'http://ejemplo.invalido/foto.jpg',
      'javascript:alert(1)',
      'no es una dirección',
      'https://www.youtube.com/watch',
      '',
    ]) {
      expect(vistaDelEnlace(enlace), enlace).toBeNull();
    }
  });
});

describe('cómo se ve adentro un archivo subido', () => {
  it('la imagen y el PDF se ven adentro', () => {
    expect(vistaDelArchivo('image/png')).toBe('imagen');
    expect(vistaDelArchivo('application/pdf')).toBe('marco');
  });

  it('Word y Excel se descargan, sin pasar por ningún visor de afuera', () => {
    expect(vistaDelArchivo('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull();
    expect(vistaDelArchivo('application/vnd.ms-excel')).toBeNull();
    expect(vistaDelArchivo(undefined)).toBeNull();
  });
});
