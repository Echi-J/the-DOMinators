import { validateLiftFeed } from './access-validation.mjs';

export const LIFT_FEED_URL = 'https://api.tfl.gov.uk/Disruptions/Lifts/';

// TfL's edge rejects requests without an explicit User-Agent in this deployment.
// Keep the identifying header in one shared, testable upstream adapter.
export async function fetchLiftFeed({ appKey, fetchImpl = fetch } = {}) {
  const url = new URL(LIFT_FEED_URL);
  if (appKey) url.searchParams.set('app_key', appKey);
  const result = await fetchImpl(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json', 'User-Agent': 'AccessLondonData/1.0' },
    cache: 'no-store',
  });
  if (!result.ok) throw Object.assign(new Error('TfL upstream HTTP ' + result.status),
    {status:result.status,retryAfter:result.headers?.get('Retry-After')??null});
  return validateLiftFeed(await result.json());
}

export function nextRetryAt(error,now=Date.now()){
  const seconds=Number(error?.retryAfter);
  const specified=error?.retryAfter&&(Number.isFinite(seconds)?seconds*1000:Date.parse(error.retryAfter)-now);
  const delay=Number.isFinite(specified)&&specified>0?specified:error?.status===429?120_000:60_000;
  return new Date(now+Math.min(15*60_000,Math.max(30_000,delay))).toISOString();
}
