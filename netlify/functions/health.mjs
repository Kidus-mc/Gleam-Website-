// Says whether the server is set up (secret present and accepted by Wix). Reveals nothing else.
import { queryItems, json } from '../lib/wix.mjs';

export default async () => {
  try { await queryItems('Detailers', { paging: { limit: 1 } }); return json(200, { ready: true }); }
  catch (e) { return json(200, { ready: false, reason: e.code || 'error' }); }
};

export const config = { path: '/api/health' };
