import { describe, expect, it } from 'vitest';
import { isIpOrCidr } from './ip';

describe('isIpOrCidr', () => {
  it.each([
    '203.0.113.42',
    '0.0.0.0',
    '198.51.100.0/24',
    '10.0.0.0/8',
    '2001:db8::1',
    '::1',
    '::',
    '2001:db8::/32',
    '::ffff:192.0.2.1',
    'fe80:0:0:0:0:0:0:1/128',
  ])('accepts %s', (v) => expect(isIpOrCidr(v)).toBe(true));

  it.each([
    '',
    '999.1.1.1',
    '1.2.3',
    '1.2.3.4.5',
    '01.2.3.4',
    '1.2.3.4/33',
    '2001:db8::/129',
    '1::2::3',
    'gggg::1',
    '1:2:3:4:5:6:7:8:9',
    '1.2.3.4/',
    'example.com',
  ])('rejects %s', (v) => expect(isIpOrCidr(v)).toBe(false));
});
