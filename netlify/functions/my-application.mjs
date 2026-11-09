// The logged-in member's latest detailer application, and whether it's live on Gleam.
import { handle, memberFrom, sameOrigin, wixAdmin, json } from '../lib/wix.mjs';

export default handle(async req => {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  const or = [{ memberId: member.id }];
  if (member.email) or.push({ memberEmail: member.email }, { email: member.email });
  const q = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'DetailerApplications',
    query: { filter: { $or: or }, sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 1 } } });
  const it = (q.dataItems || [])[0];
  if (!it) return json(200, { application: null, live: false });
  const v = it.data || {};
  const l = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'Detailers', query: { filter: { applicationId: it.id }, paging: { limit: 1 } } });
  const keep = ['name', 'city', 'state', 'radiusMiles', 'priceExterior', 'priceInterior', 'priceFull', 'addons', 'status', 'serviceMobile', 'serviceShop', 'shopName', '_createdDate'];
  const application = { _id: it.id };
  for (const k of keep) if (v[k] !== undefined) application[k] = v[k];
  return json(200, { application, live: (l.dataItems || []).length > 0 });
});

export const config = { path: '/api/my-application' };
