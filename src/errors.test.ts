import { describe, expect, it } from 'vitest';
import { AuthenticatedImageError, toAuthenticatedImageError } from './errors';

describe('AuthenticatedImageError', () => {
  it('carries src, status and cause', () => {
    const cause = new Error('boom');
    const error = new AuthenticatedImageError('failed', { src: '/a', status: 401, cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuthenticatedImageError');
    expect(error.message).toBe('failed');
    expect(error.src).toBe('/a');
    expect(error.status).toBe(401);
    expect(error.cause).toBe(cause);
  });

  it('leaves status undefined when it is not given', () => {
    expect(new AuthenticatedImageError('failed', { src: '/a' }).status).toBeUndefined();
  });
});

describe('toAuthenticatedImageError', () => {
  it('returns AuthenticatedImageError instances unchanged', () => {
    const error = new AuthenticatedImageError('failed', { src: '/a' });
    expect(toAuthenticatedImageError('/a', error)).toBe(error);
  });

  it('wraps other values as the cause', () => {
    const cause = new TypeError('network');
    const error = toAuthenticatedImageError('/a', cause);
    expect(error).toBeInstanceOf(AuthenticatedImageError);
    expect(error.src).toBe('/a');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Failed to load image: /a');
  });
});
