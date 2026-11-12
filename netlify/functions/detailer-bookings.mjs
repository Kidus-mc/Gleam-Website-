// Booking requests sent to the logged-in detailer, and Confirm / Decline.
// A detailer only ever sees and changes requests for their own listings.
import { handle, memberFrom, sameOrigin, wixAdmin, json, listingsForMember } from '../lib/wix.mjs';
import { sendEmail, sendText, quietly } from '../lib/notify.mjs';

const ACTIONS = { confirm: 'confirmed', decline: 'declined', done: 'completed' };
const ALLOWED = { confirm: ['new'], decline: ['new', 'confirmed'], done: ['confirmed'] };

export default handle(async (req, ctx) => {
  sameOrigin(req);
  const member = await memberFrom(req);
  const mine = await listingsForMember(member);
  const ids = mine.map(l => l.id);

  if (req.method === 'GET') {
    if (!ids.length) return json(200, { detailer: false, items: [] });
    const res = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'BookingRequests', query: {
      filter: { detailerId: { $in: ids } }, sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 100 } } });
    const items = (res.dataItems || []).map(x => {
      const v = x.data || {};
      return { _id: x.id, _createdDate: v._createdDate, listing: v.detailerName, package: v.package, addons: v.addons, total: v.total,
        preferredTime: v.preferredTime, status: v.status || 'new', serviceType: v.serviceType || 'mobile',
        customerName: v.customerName, phone: v.phone, email: v.email, address: v.address, zip: v.zip, notes: v.notes, shopName: v.shopName };
    });
    return json(200, { detailer: true, items });
  }

  if (req.method !== 'POST') return json(405, { error: 'method' });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || ''), action = String(b.action || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id) || !ACTIONS[action]) return json(400, { error: 'bad_request' });

  let item;
  try { item = (await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(id) + '?dataCollectionId=BookingRequests', undefined, 'GET')).dataItem; }
  catch (e) { if (e.status === 404) return json(404, { error: 'not_found' }); throw e; }
  const v = item.data || {};
  if (!ids.includes(v.detailerId)) return json(404, { error: 'not_found' });   // not this detailer's booking
  const from = v.status || 'new';
  if (!ALLOWED[action].includes(from)) return json(409, { error: 'already_' + from, status: from });

  const status = ACTIONS[action];
  const data = { ...v, status, statusChangedAt: new Date().toISOString() };
  delete data._createdDate; delete data._updatedDate;
  await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(id), { dataCollectionId: 'BookingRequests', dataItem: { id, data } }, 'PUT');

  // Let the customer know.
  if (status !== 'completed') {
    const who = String(v.detailerName || 'Your detailer'), when = v.preferredTime || 'the time you picked';
    const head = status === 'confirmed' ? who + ' confirmed your Gleam booking' : who + ' can’t make your Gleam booking';
    const line = status === 'confirmed'
      ? v.package + ' · ' + when + (v.serviceType === 'shop' ? ' · at ' + (v.shopName || 'the shop') : '') + '. Questions? Reply to ' + who + ' directly.'
      : 'They declined ' + v.package + ' for ' + when + '. You weren’t charged. Pick another detailer on Gleam.';
    await quietly(ctx, [sendEmail(v.email, head, [head, '', line]), sendText(v.phone, 'Gleam: ' + head + '. ' + line)]);
  }
  return json(200, { ok: true, status });
});

export const config = { path: '/api/detailer-bookings' };
