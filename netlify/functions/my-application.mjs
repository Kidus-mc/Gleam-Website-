// The logged-in member's latest detailer application, and whether it's live on Gleam.
import { handle, memberFrom, sameOrigin, json, queryItems, ownedBy } from '../lib/wix.mjs';

// Fields the member sees about their own application.
const KEEP = ['name', 'city', 'state', 'radiusMiles', 'priceExterior', 'priceInterior', 'priceFull', 'addons', 'status', 'serviceMobile', 'serviceShop', 'shopName', '_createdDate'];

export default handle(async req => {
  if (req.method !== 'GET') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  const [it] = await queryItems('DetailerApplications', { filter: ownedBy(member), sort: [{ fieldName: '_createdDate', order: 'DESC' }], paging: { limit: 1 } });
  if (!it) return json(200, { application: null, live: false });
  const v = it.data || {};
  const listed = await queryItems('Detailers', { filter: { applicationId: it.id }, paging: { limit: 1 } });
  const application = { _id: it.id };
  for (const k of KEEP) if (v[k] !== undefined) application[k] = v[k];
  return json(200, { application, live: listed.length > 0 });
});

export const config = { path: '/api/my-application' };
