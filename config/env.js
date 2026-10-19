// Environment config. Override from CLI: k6 run -e BASE_URL=http://host:port -e PARTNER_KEY=xxx ...
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
export const PARTNER_KEY = __ENV.PARTNER_KEY || 'ROADTOSDET';
export const OTP = __ENV.OTP || '0000'; // dev OTP for /user/verify-otp?env=dev
