/** Bearer token accepted by the mock API. */
export const MOCK_TOKEN = 'mock-token';

/** Path prefix served by the mock API plugin. */
export const MOCK_API_PREFIX = '/mock-api';

/** Headers that authorize a request against the mock API. */
export const mockAuthHeaders = { Authorization: `Bearer ${MOCK_TOKEN}` } as const;
