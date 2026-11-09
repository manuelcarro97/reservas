import { TestBed } from '@angular/core/testing';
import { SiteFooterComponent } from './site-footer.component';

describe('SiteFooterComponent', () => {
  it('creditsTheProjectAndLinksToTheAuthorInANewTab', () => {
    const fixture = TestBed.createComponent(SiteFooterComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('footer')).toHaveLength(1);
    expect(host.textContent).toContain('© 2026 reservas. · Proyecto de portafolio');
    const link = host.querySelector<HTMLAnchorElement>('footer a')!;
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Desarrollado por Manuel Carro');
    expect(link.getAttribute('href')).toBe('https://www.linkedin.com/in/manuelcarro');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
