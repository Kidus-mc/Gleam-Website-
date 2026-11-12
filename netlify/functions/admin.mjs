// Gleam's owner page: every booking, detailer applications to approve, and live listings.
// Only people in the admin-only "TeamRoles" list (owner, co-owner) get past the first check.
import { handle, memberFrom, sameOrigin, wixAdmin, json, teamRole } from '../lib/wix.mjs';

// Fields copied from an application to the public listing. Contact details (email, phone, home address) never are.
const PUBLIC = ['name', 'about', 'city', 'state', 'zip', 'radiusMiles', 'priceExterior', 'priceInterior', 'priceFull', 'priceAddons',
  'addons', 'addonsSummary', 'serviceMobile', 'serviceShop', 'shopName', 'shopAddress', 'shopCity', 'shopState', 'shopZip'];
const BOOKING = ['new', 'confirmed', 'declined', 'completed', 'cancelled'];
const ID = /^[A-Za-z0-9-]{8,64}$/;
const all = async (c, extra = {}) => ((await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: c,
  query: { sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 200 }, ...extra } })).dataItems || []).map(x => ({ _id: x.id, ...(x.data || {}) }));
const getItem = async (c, id) => (await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(id) + '?dataCollectionId=' + c, undefined, 'GET')).dataItem.data;
const put = (c, id, data) => { const d = { ...data }; delete d._createdDate; delete d._updatedDate;
  return wixAdmin('/wix-data/v2/items/' + encodeURIComponent(id), { dataCollectionId: c, dataItem: { id, data: d } }, 'PUT'); };

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
  if (!ID.test(id)) return json(400, { error: 'id' });

  if (b.action === 'approve') {
    const a = await getItem('DetailerApplications', id);
    const listing = { applicationId: id };
    for (const k of PUBLIC) if (a[k] !== undefined && a[k] !== '') listing[k] = a[k];
    // Re-applying (new prices) updates their existing listing of the same kind instead of adding a second one.
    const mine = (await all('DetailerApplications')).filter(x => x._id !== id && (
      (a.memberId && x.memberId === a.memberId) || (a.email && (x.email === a.email || x.memberEmail === a.email)))).map(x => x._id);
    const old = mine.length ? (await all('Detailers', { filter: { applicationId: { $in: mine } } }))
      .find(l => !!l.serviceShop === !!a.serviceShop && (!a.serviceShop || l.shopName === a.shopName)) : null;
    if (old) await put('Detailers', old._id, listing);
    else await wixAdmin('/wix-data/v2/items', { dataCollectionId: 'Detailers', dataItem: { data: listing } });
    await put('DetailerApplications', id, { ...a, status: 'approved', reviewedBy: member.email, reviewedAt: new Date().toISOString() });
    return json(200, { ok: true, replaced: !!old });
  }
  if (b.action === 'decline_application') {
    const a = await getItem('DetailerApplications', id);
    await put('DetailerApplications', id, { ...a, status: 'declined', reviewedBy: member.email, reviewedAt: new Date().toISOString() });
    return json(200, { ok: true });
  }
  if (b.action === 'unlist') {
    await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(id) + '?dataCollectionId=Detailers', undefined, 'DELETE');
    return json(200, { ok: true });
  }
  if (b.action === 'booking_status') {
    if (!BOOKING.includes(b.status)) return json(400, { error: 'status' });
    const v = await getItem('BookingRequests', id);
    await put('BookingRequests', id, { ...v, status: b.status, statusChangedAt: new Date().toISOString(), statusChangedBy: member.email });
    return json(200, { ok: true });
  }
  return json(400, { error: 'action' });
});

export const config = { path: '/api/admin' };
