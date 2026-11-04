import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
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
});
