import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LOAD_AUTH_SDK } from './auth-sdk';
import { AuthService } from './auth.service';
import { FakeAuthSdk, flushPromises, provideFakeAuthSdk } from './testing/fake-auth-sdk';

const USER = { uid: 'uid-1', email: 'dueno@example.com' };

describe('AuthService', () => {
  let sdk: FakeAuthSdk;
  let auth: AuthService;

  beforeEach(() => {
    sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({ providers: [provideFakeAuthSdk(sdk)] });
    auth = TestBed.inject(AuthService);
  });

  it('startsNotReadyAndWithoutUser', () => {
    expect(auth.ready()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('becomesReadyWithTheRestoredUser', async () => {
    await flushPromises();
    sdk.emit(USER);

    expect(auth.ready()).toBe(true);
    expect(auth.user()).toEqual(USER);
  });

  it('becomesReadyWithoutUserWhenThereIsNoSession', async () => {
    await flushPromises();
    sdk.emit(null);

    expect(auth.ready()).toBe(true);
    expect(auth.user()).toBeNull();
  });

  it('followsLaterChangesOfTheSession', async () => {
    await flushPromises();
    sdk.emit(USER);
    sdk.emit(null);

    expect(auth.user()).toBeNull();
  });

  it('idTokenWaitsForTheSessionToBeRestored', async () => {
    const token = auth.idToken();
    await flushPromises();
    sdk.emit(USER);

    await expect(token).resolves.toBe('token-1');
  });

  it('idTokenIsNullWithoutSession', async () => {
    const token = auth.idToken();
    await flushPromises();
    sdk.emit(null);

    await expect(token).resolves.toBeNull();
  });

  it('delegatesActionsToTheSdk', async () => {
    await auth.signInWithEmail('a@b.es', 'secreto1');
    await auth.register('c@d.es', 'secreto2');
    await auth.signInWithGoogle();
    await auth.sendPasswordReset('e@f.es');
    await auth.signOut();

    expect(sdk.calls).toEqual([
      { method: 'signInWithEmail', args: ['a@b.es', 'secreto1'] },
      { method: 'register', args: ['c@d.es', 'secreto2'] },
      { method: 'signInWithGoogle', args: [] },
      { method: 'sendPasswordReset', args: ['e@f.es'] },
      { method: 'signOut', args: [] },
    ]);
  });

  it('propagatesSdkErrors', async () => {
    sdk.failWith = { code: 'auth/invalid-credential' };

    await expect(auth.signInWithEmail('a@b.es', 'mal')).rejects.toEqual({
      code: 'auth/invalid-credential',
    });
  });
});

describe('AuthService user signal', () => {
  it('doesNotNotifyWhenTheTokenIsRenewedForTheSameUser', async () => {
    const sdk = new FakeAuthSdk();
    TestBed.configureTestingModule({ providers: [provideFakeAuthSdk(sdk)] });
    const auth = TestBed.inject(AuthService);
    let reads = 0;
    const watched = computed(() => {
      reads++;
      return auth.user();
    });
    await flushPromises();

    sdk.emit(USER);
    watched();
    sdk.emit({ ...USER });
    watched();

    expect(reads).toBe(1);

    sdk.emit({ uid: 'uid-2', email: USER.email });
    watched();

    expect(reads).toBe(2);
  });
});

describe('AuthService retrying the SDK load', () => {
  it('retriesAfterAFailedLoadInsteadOfCachingTheFailure', async () => {
    const sdk = new FakeAuthSdk();
    const loader = vi
      .fn<() => Promise<FakeAuthSdk>>()
      .mockRejectedValueOnce(new Error('chunk load failed'))
      .mockResolvedValue(sdk);
    TestBed.configureTestingModule({ providers: [{ provide: LOAD_AUTH_SDK, useValue: loader }] });
    const auth = TestBed.inject(AuthService);
    await auth.whenReady();
    expect(loader).toHaveBeenCalledTimes(1);

    await auth.signInWithEmail('a@b.es', 'secreto1');

    expect(loader).toHaveBeenCalledTimes(2);
    expect(sdk.callsTo('signInWithEmail')).toEqual([['a@b.es', 'secreto1']]);

    // Una vez cargado, no se vuelve a pedir y la sesión llega con normalidad.
    sdk.emit(USER);
    await expect(auth.idToken()).resolves.toBe('token-1');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(auth.user()).toEqual(USER);
  });
});

describe('AuthService when the SDK cannot be loaded', () => {
  it('becomesReadyWithoutUserAndTokenRequestsFail', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LOAD_AUTH_SDK, useValue: () => Promise.reject(new Error('chunk load failed')) },
      ],
    });
    const auth = TestBed.inject(AuthService);

    await auth.whenReady();

    expect(auth.ready()).toBe(true);
    expect(auth.user()).toBeNull();
    await expect(auth.idToken()).rejects.toThrow('chunk load failed');
  });
});
