import { mockAuthHeaders } from '../dev/mock-api-shared';
import { type AuthenticatedImageElement, configure, type Fetcher } from '../src/index';

configure({ headers: mockAuthHeaders });

function byId(id: string): AuthenticatedImageElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as AuthenticatedImageElement;
}

// An element-level override without a token, to show the error slot.
byId('unauthorized').headers = {};

// The fetcher asks the API for a presigned URL and returns it as a string.
const presign: Fetcher = async (src, { signal }) => {
  const response = await fetch(src, { headers: mockAuthHeaders, signal });
  const { url } = (await response.json()) as { url: string };
  return url;
};
byId('presigned').fetcher = presign;

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest('[data-retry]');
  button?.closest('authenticated-image')?.reload();
});
