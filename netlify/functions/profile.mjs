// The logged-in member's own saved ZIP code and street address (stored in Wix, keyed by their Supabase login).
import { handle, memberFrom, sameOrigin, wixAdmin, json, clip, LINK } from '../lib/wix.mjs';

async function find(memberId) {
  const q = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'MemberProfiles',
    query: { filter: { memberId }, sort: [{ fieldName: '_updatedDate', order: 'DESC' }], paging: { limit: 1 } } });
  return (q.dataItems || [])[0] || null;
}

export default handle(async req => {
  sameOrigin(req);
  const member = await memberFrom(req);
  const item = await find(member.id);
  if (req.method === 'GET') {
    return json(200, item ? { zip: item.data.zip || '', address: item.data.address || '' } : { zip: '', address: '' });
  }
  if (req.method !== 'PUT') return json(405, { error: 'method' });
  const b = await req.json().catch(() => ({}));
  const zip = clip(b.zip, 5), address = clip(b.address, 150);
  if (!/^\d{5}$/.test(zip)) return json(400, { error: 'zip' });
  if (LINK.test(address)) return json(400, { error: 'address' });
  const data = { zip, address, memberId: member.id, memberEmail: member.email };
  if (item) await wixAdmin('/wix-data/v2/items/' + item.id, { dataCollectionId: 'MemberProfiles', dataItem: { id: item.id, data } }, 'PUT');
  else await wixAdmin('/wix-data/v2/items', { dataCollectionId: 'MemberProfiles', dataItem: { data } });
  return json(200, { zip, address });
});

export const config = { path: '/api/profile' };
