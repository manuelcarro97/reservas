import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { PublicTitle } from '../public/public-title.service';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class OtherPage {}

describe('ShellComponent', () => {
  async function start(url: string): Promise<RouterTestingHarness> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: ShellComponent,
            children: [{ path: 'otra', component: OtherPage }],
          },
        ]),
      ],
    });
    return RouterTestingHarness.create(url);
  }

  function header(harness: RouterTestingHarness): Element | null {
    return (harness.routeNativeElement as HTMLElement).querySelector('header');
  }

  function footers(harness: RouterTestingHarness): NodeListOf<Element> {
    return (harness.routeNativeElement as HTMLElement).querySelectorAll('footer');
  }

  it('headerVisibleByDefault', async () => {
    const harness = await start('/');

    expect(header(harness)).not.toBeNull();
  });

  it('headerHiddenInEmbedMode', async () => {
    const harness = await start('/?embed=1');

    expect(header(harness)).toBeNull();
  });

  it('embedModeSurvivesNavigationWithoutQuery', async () => {
    const harness = await start('/?embed=1');

    await harness.navigateByUrl('/otra');
    harness.detectChanges();

    expect(header(harness)).toBeNull();
  });

  it('embedModeIsNotActivatedByLaterNavigation', async () => {
    const harness = await start('/');

    await harness.navigateByUrl('/otra?embed=1');
    harness.detectChanges();

    expect(header(harness)).not.toBeNull();
  });

  it('headerShowsTheBrandWhenNoPageNamesAVenue', async () => {
    const harness = await start('/');

    expect(header(harness)?.textContent).toContain('reservas.');
  });

  it('headerShowsTheVenueNameInsteadOfTheBrandWhenAPageNamesOne', async () => {
    const harness = await start('/');

    TestBed.inject(PublicTitle).name.set('Kafé');
    harness.detectChanges();

    expect(header(harness)?.textContent).toContain('Kafé');
    expect(header(harness)?.textContent).not.toContain('reservas.');
  });

  it('venueNameIsShownAsTextNeverAsMarkup', async () => {
    const harness = await start('/');

    TestBed.inject(PublicTitle).name.set('<img src=x onerror=alert(1)>');
    harness.detectChanges();

    expect(header(harness)?.querySelector('img')).toBeNull();
    expect(header(harness)?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('footerShownOnceWithTheAuthorLink', async () => {
    const harness = await start('/otra');

    expect(footers(harness)).toHaveLength(1);
    const link = footers(harness)[0].querySelector<HTMLAnchorElement>('a');
    expect(link?.getAttribute('href')).toBe('https://www.linkedin.com/in/manuelcarro');
  });

  it('footerOnceInEmbed', async () => {
    const harness = await start('/?embed=1');

    expect(header(harness)).toBeNull();
    expect(footers(harness)).toHaveLength(1);
    expect(footers(harness)[0].textContent).toContain('Desarrollado por');
  });
});
