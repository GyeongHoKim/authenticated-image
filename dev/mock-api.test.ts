import { describe, expect, it } from 'vitest';
import { MOCK_API_PREFIX, mockAuthHeaders } from './mock-api-shared.ts';

const images = `${MOCK_API_PREFIX}/images`;

describe('mock API', () => {
  it('rejects image requests without the bearer token', async () => {
    const response = await fetch(`${images}/cat`);
    expect(response.status).toBe(401);
  });

  it('serves an SVG when the bearer token is present', async () => {
    const response = await fetch(`${images}/cat`, { headers: mockAuthHeaders });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('forces a status code with ?status', async () => {
    const response = await fetch(`${images}/cat?status=404`, { headers: mockAuthHeaders });
    expect(response.status).toBe(404);
  });

  it('serves bytes that are not an image with ?body=broken', async () => {
    const response = await fetch(`${images}/cat?body=broken`, { headers: mockAuthHeaders });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('issues presigned URLs that work without headers', async () => {
    const response = await fetch(`${MOCK_API_PREFIX}/presign/cat`, { headers: mockAuthHeaders });
    const { url } = (await response.json()) as { url: string };
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url.replace(/sig=[0-9a-f]+/, 'sig=00'))).status).toBe(403);
  });

  it('rejects expired signatures', async () => {
    const response = await fetch(`${MOCK_API_PREFIX}/signed/cat?expires=0&sig=00`);
    expect(response.status).toBe(403);
  });

  it('returns 404 for unknown endpoints', async () => {
    const response = await fetch(`${MOCK_API_PREFIX}/unknown/cat`);
    expect(response.status).toBe(404);
  });
});
