// Vercel edge adapter, same pattern as the other two functions.
import { onRequest } from '../functions/api/review.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  return onRequest({
    request,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      REVIEW_KEY: process.env.REVIEW_KEY,
    },
  });
}
