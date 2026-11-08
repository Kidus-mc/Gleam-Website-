// Says whether the server is set up (secret present and accepted by Wix). Reveals nothing else.
import { wixAdmin, json } from '../lib/wix.mjs';

export default async () => {
  try { await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'Detailers', query: { paging: { limit: 1 } } }); return json(200, { ready: true }); }
  catch (e) { return json(200, { ready: false, reason: e.code || 'error' }); }
};

export const config = { path: '/api/health' };
