import { TestBed } from '@angular/core/testing';
import { ICON_NAMES, IconComponent, IconName } from './icon.component';

describe('IconComponent', () => {
  function render(name: IconName, label?: string): SVGSVGElement {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    if (label !== undefined) {
      fixture.componentRef.setInput('label', label);
    }
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGSVGElement;
  }

  it('rendersTheIconOfItsName', () => {
    const svg = render('bell');

    expect(svg.getAttribute('data-icon')).toBe('bell');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('everyIconDrawsSomething', () => {
    for (const name of ICON_NAMES) {
      const svg = render(name);

      expect(svg.getAttribute('data-icon'), name).toBe(name);
      const shapes = svg.querySelectorAll('path, circle, rect');

      expect(shapes.length, name).toBeGreaterThan(0);
      expect(shapes[0].namespaceURI, name).toBe('http://www.w3.org/2000/svg');
    }
  });

  it('decorativeByDefault', () => {
    const svg = render('bell');

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('role')).toBe(false);
  });

  it('labelledWhenGivenALabel', () => {
    const svg = render('bell', 'Avisos');

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Avisos');
    expect(svg.hasAttribute('aria-hidden')).toBe(false);
  });
});
