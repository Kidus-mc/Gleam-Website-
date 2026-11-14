// Gleam's owner page: every booking, detailer applications to approve, and live listings.
// Only people in the admin-only "TeamRoles" list (owner, co-owner) get past the first check.
import { handle, memberFrom, sameOrigin, json, teamRole, isId, queryItems, getItem, insertItem, replaceItem, removeItem } from '../lib/wix.mjs';

// Fields copied from an application to the public listing. Contact details (email, phone, home address) never are.
const PUBLIC = ['name', 'about', 'city', 'state', 'zip', 'radiusMiles', 'priceExterior', 'priceInterior', 'priceFull', 'priceAddons',
  'addons', 'addonsSummary', 'serviceMobile', 'serviceShop', 'shopName', 'shopAddress', 'shopCity', 'shopState', 'shopZip'];
const BOOKING = ['new', 'confirmed', 'declined', 'completed', 'cancelled'];
// Newest first, up to 200, flattened to { _id, ...fields }.
const all = async (collection, extra = {}) =>
  (await queryItems(collection, { sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 200 }, ...extra }))
    .map(x => ({ _id: x.id, ...(x.data || {}) }));
const reviewed = (a, status, member) => ({ ...a, status, reviewedBy: member.email, reviewedAt: new Date().toISOString() });

export default handle(async req => {
  sameOrigin(req);
  const member = await memberFrom(req);
  const me = await teamRole(member);
  if (!me) return json(403, { error: 'not_team' });

  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('check')) return json(200, me);
    const [bookings, applications, listings, team] = await Promise.all([all('BookingRequests'), all('DetailerApplications'), all('Detailers'), all('TeamRoles')]);
    for (const a of applications) delete a.memberId;
    return json(200, { ...me, team: team.map(t => ({ name: t.name, email: t.email, role: t.role })), bookings, applications, listings });
  }
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!isId(id)) return json(400, { error: 'id' });

  if (b.action === 'approve') {
    const a = await getItem('DetailerApplications', id);
    const listing = { applicationId: id };
    for (const k of PUBLIC) if (a[k] !== undefined && a[k] !== '') listing[k] = a[k];
    // Re-applying (new prices) updates their existing listing of the same kind instead of adding a second one.
    const mine = (await all('DetailerApplications')).filter(x => x._id !== id && (
      (a.memberId && x.memberId === a.memberId) || (a.email && (x.email === a.email || x.memberEmail === a.email)))).map(x => x._id);
    const old = mine.length ? (await all('Detailers', { filter: { applicationId: { $in: mine } } }))
      .find(l => !!l.serviceShop === !!a.serviceShop && (!a.serviceShop || l.shopName === a.shopName)) : null;
    if (old) await replaceItem('Detailers', old._id, listing);
    else await insertItem('Detailers', listing);
    await replaceItem('DetailerApplications', id, reviewed(a, 'approved', member));
    return json(200, { ok: true, replaced: !!old });
  }
  if (b.action === 'decline_application') {
    const a = await getItem('DetailerApplications', id);
    await replaceItem('DetailerApplications', id, reviewed(a, 'declined', member));
    return json(200, { ok: true });
  }
  if (b.action === 'unlist') {
    await removeItem('Detailers', id);
    return json(200, { ok: true });
  }
  if (b.action === 'booking_status') {
    if (!BOOKING.includes(b.status)) return json(400, { error: 'status' });
    const v = await getItem('BookingRequests', id);
    await replaceItem('BookingRequests', id, { ...v, status: b.status, statusChangedAt: new Date().toISOString(), statusChangedBy: member.email });
    return json(200, { ok: true });
  }
  return json(400, { error: 'action' });
});

export const config = { path: '/api/admin' };
