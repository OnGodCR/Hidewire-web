// ---------------------------------------------------------------------------
// POST /api/waitlist, the Vercel entry point.
//
// The endpoint itself lives in functions/api/waitlist.js and is written
// against the standard Request and Response types, so hosting it anywhere is
// a question of adapters, not rewrites. This one is Vercel's: an Edge
// Function, because the Edge runtime speaks those same standard types and the
// Node one does not. Cloudflare Pages would use functions/api/waitlist.js
// directly, with the secrets set in the Pages project instead.
//
// Only the three variables the endpoint documents are passed through. Vercel
// puts its own values in process.env too, and forwarding the whole object
// would widen what the endpoint can see for no reason.
// ---------------------------------------------------------------------------

import { onRequest } from '../functions/api/waitlist.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  return onRequest({
    request,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      WAITLIST_TABLE: process.env.WAITLIST_TABLE,
    },
  });
}
