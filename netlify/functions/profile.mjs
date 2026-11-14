// The logged-in member's own saved ZIP code and street address (stored in Wix, keyed by their Supabase login).
import { handle, memberFrom, sameOrigin, json, clip, LINK, queryItems, insertItem, replaceItem } from '../lib/wix.mjs';

async function find(memberId) {
  const [item] = await queryItems('MemberProfiles', { filter: { memberId }, sort: [{ fieldName: '_updatedDate', order: 'DESC' }], paging: { limit: 1 } });
  return item || null;
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
  if (item) await replaceItem('MemberProfiles', item.id, data);
  else await insertItem('MemberProfiles', data);
  return json(200, { zip, address });
});

export const config = { path: '/api/profile' };
