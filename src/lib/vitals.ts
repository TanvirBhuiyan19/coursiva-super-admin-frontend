// Real-user monitoring of Core Web Vitals (LCP, INP, CLS) plus FCP and TTFB.
// Loaded on idle after the first render; beacons are batched and flushed when the page is hidden,
// so measurement never competes with the app for the network or main thread.
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { env } from '@/config/env';

interface VitalSample {
  name: Metric['name'];
  value: number;
  rating: Metric['rating'];
  id: string;
  /** Route pattern-ish path (ids stripped) so metrics aggregate per screen. */
  path: string;
  navigationType: Metric['navigationType'];
}

const queue: VitalSample[] = [];
const screenPath = () => location.pathname.replace(/\/(tn|st|tk|in|au)_[a-z0-9]+/gi, '/:id');

function flush() {
  if (!queue.length || !env.vitalsEndpoint) return;
  const body = JSON.stringify({ metrics: queue.splice(0), release: env.release });
  // sendBeacon survives page unload; fall back to keepalive fetch.
  if (!navigator.sendBeacon(env.vitalsEndpoint, new Blob([body], { type: 'application/json' }))) {
    void fetch(env.vitalsEndpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      () => undefined,
    );
  }
}

function record(metric: Metric) {
  queue.push({
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating,
    id: metric.id,
    path: screenPath(),
    navigationType: metric.navigationType,
  });
  if (env.isDev && metric.rating !== 'good')
    console.warn(`[vitals] ${metric.name} ${Math.round(metric.value)} (${metric.rating}) on ${screenPath()}`);
}

export function startVitals() {
  onLCP(record);
  onINP(record);
  onCLS(record);
  onFCP(record);
  onTTFB(record);
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
