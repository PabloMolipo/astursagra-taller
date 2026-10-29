import { markdownAHtml } from './markdown';

describe('markdownAHtml', () => {
  it('escapa el HTML (no se puede inyectar código)', () => {
    const html = markdownAHtml('<img src=x onerror="alert(1)"> **hola**');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>hola</strong>');
  });

  it('listas, encabezados y enlaces a órdenes', () => {
    const html = markdownAHtml('## Causas\n1. EGR sucia\n2. Fuga en admisión\n\nComo en OT-00012, revisar `P0401`.');
    expect(html).toContain('<h4>Causas</h4>');
    expect(html).toContain('<ol><li>EGR sucia</li><li>Fuga en admisión</li></ol>');
    expect(html).toContain('<a href="/gestion/ordenes/12">OT-00012</a>');
    expect(html).toContain('<code>P0401</code>');
  });

  it('enlaces web en otra pestaña, con el dominio a la vista; nada que no sea http/https', () => {
    const html = markdownAHtml('Mira [RealOEM](https://www.realoem.com/bmw/enUS/select?vin=CF25655&a=1) o https://partsouq.com/en/search/all?q=X.');
    expect(html).toContain('<a href="https://www.realoem.com/bmw/enUS/select?vin=CF25655&amp;a=1" target="_blank" rel="noopener noreferrer">RealOEM</a> <span class="dominio">(realoem.com)</span>');
    expect(html).toContain('<a href="https://partsouq.com/en/search/all?q=X" target="_blank" rel="noopener noreferrer">https://partsouq.com/en/search/all?q=X</a>.');
    const malo = markdownAHtml('[pulsa](javascript:alert(1)) [x](https://a.com" onclick="alert(1))');
    expect(malo).not.toContain('href="javascript');
    expect(malo).not.toContain('" onclick');
  });
});
