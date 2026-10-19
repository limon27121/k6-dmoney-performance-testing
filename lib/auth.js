import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL, PARTNER_KEY, OTP } from '../config/env.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Two-step login: /user/login (sends OTP) -> /user/verify-otp (returns token).
// Login requests are tagged api:login so they stay out of transaction metrics.
export function login(user) {
  const params = { headers: JSON_HEADERS, tags: { api: 'login' } };

  const loginRes = http.post(
    `${BASE_URL}/user/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    params,
  );
  const loginOk = check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: OTP required': (r) => r.json('otpRequired') === true,
  }, { api: 'login' });
  if (!loginOk) fail(`Login failed for ${user.phone}: ${loginRes.status} ${loginRes.body}`);

  const otpRes = http.post(
    `${BASE_URL}/user/verify-otp?env=dev`,
    JSON.stringify({ identifier: user.phone, otp: OTP }),
    params,
  );
  const otpOk = check(otpRes, {
    'verify-otp: status 200': (r) => r.status === 200,
    'verify-otp: token returned': (r) => !!r.json('token'),
  }, { api: 'login' });
  if (!otpOk) fail(`OTP verify failed for ${user.phone}: ${otpRes.status} ${otpRes.body}`);

  return otpRes.json('token');
}

// Headers for authenticated transaction requests.
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `bearer ${token}`,
    'X-AUTH-SECRET-KEY': PARTNER_KEY,
  };
}
