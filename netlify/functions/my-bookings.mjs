// Returns ONLY the logged-in member's own booking requests.
import { handle, memberFrom, sameOrigin, json, queryItems } from '../lib/wix.mjs';

export default handle(async req => {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  // Matches by login ID or login email only: a booking's "email" field is just what the customer typed.
  const found = await queryItems('BookingRequests', {
    filter: { $or: member.email ? [{ memberId: member.id }, { memberEmail: member.email }] : [{ memberId: member.id }] },
    sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 100 } });
  const items = found.map(x => {
    const v = x.data || {};
    return { _id: x.id, _createdDate: v._createdDate, detailerName: v.detailerName, package: v.package, addons: v.addons,
      preferredTime: v.preferredTime, status: v.status, total: v.total, price: v.price,
      serviceType: v.serviceType || 'mobile', shopName: v.shopName || '', shopAddress: v.shopAddress || '' };
  });
  return json(200, { items });
});

export const config = { path: '/api/my-bookings' };
