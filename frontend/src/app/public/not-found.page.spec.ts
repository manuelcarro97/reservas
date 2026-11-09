import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NON_EMBEDDABLE_LINK_TARGET } from '../core/frame';
import { NotFoundPage } from './not-found.page';

describe('NotFoundPage', () => {
  async function link(target: '_self' | '_top'): Promise<HTMLAnchorElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: NotFoundPage }]),
        { provide: NON_EMBEDDABLE_LINK_TARGET, useValue: target },
      ],
    });
    const harness = await RouterTestingHarness.create('/nada');
    return (harness.routeNativeElement as HTMLElement).querySelector('a') as HTMLAnchorElement;
  }

  it('linksToTheLoginInTheSameWindow', async () => {
    const anchor = await link('_self');

    expect(anchor.getAttribute('href')).toBe('/entrar');
    expect(anchor.getAttribute('target')).toBe('_self');
  });

  it('leavesTheIframeToOpenTheLogin', async () => {
    const anchor = await link('_top');

    expect(anchor.getAttribute('href')).toBe('/entrar');
    expect(anchor.getAttribute('target')).toBe('_top');
  });
});
