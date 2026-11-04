import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { ApiConfiguration } from './core/api/api-configuration';
import { API_BASE_URL } from './core/config';

describe('appConfig', () => {
  it('apiClientUsesApiBaseUrl', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });

    expect(TestBed.inject(ApiConfiguration).rootUrl).toBe(TestBed.inject(API_BASE_URL));
  });
});
