// Vercel edge adapter around the host-neutral webhook, same pattern as
// api/waitlist.js. Forwards only the documented env vars.
import { onRequest } from '../functions/api/ig-webhook.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  return onRequest({
    request,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      IG_VERIFY_TOKEN: process.env.IG_VERIFY_TOKEN,
      META_APP_SECRET: process.env.META_APP_SECRET,
    },
  });
}
