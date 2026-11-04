import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  async function render(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: ShellComponent }])],
    });
    const harness = await RouterTestingHarness.create(url);
    return harness.routeNativeElement as HTMLElement;
  }

  it('headerVisibleByDefault', async () => {
    const element = await render('/');

    expect(element.querySelector('header')).not.toBeNull();
  });

  it('headerHiddenInEmbedMode', async () => {
    const element = await render('/?embed=1');

    expect(element.querySelector('header')).toBeNull();
  });
});
