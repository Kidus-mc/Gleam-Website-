// Saves a booking request. The price is worked out HERE from the detailer's own listing,
// so nothing the customer's browser sends can change it.
import { handle, memberFrom, sameOrigin, wixAdmin, json, clip, LINK } from '../lib/wix.mjs';

const PRICE_KEY = { exterior: 'priceExterior', interior: 'priceInterior', full: 'priceFull' };
const NAMES = { exterior: 'Exterior', interior: 'Interior', full: 'Full Detail', addons: 'Add-ons' };
const FEE_RATE = 0; // no Gleam service fee
const r2 = x => Math.round(x * 100) / 100;
const money = v => '$' + (Math.round(v * 100) % 100 ? v.toFixed(2) : Math.round(v));
const MAX_PER_HOUR = 5;

export default handle(async req => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  const b = await req.json().catch(() => ({}));

  const pkg = String(b.package || '');
  if (!NAMES[pkg]) return json(400, { error: 'package' });
  const detailerId = clip(b.detailerId, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(detailerId)) return json(400, { error: 'detailer' });
  const customerName = clip(b.customerName, 80), phone = clip(b.phone, 30), email = clip(b.email, 120);
  const address = clip(b.address, 150), zip = clip(b.zip, 5), preferredTime = clip(b.preferredTime, 80), notes = clip(b.notes, 500);
  const serviceType = b.serviceType === 'shop' ? 'shop' : 'mobile';
  const digits = phone.replace(/\D/g, '');
  if (customerName.length < 2 || LINK.test(customerName)) return json(400, { error: 'name' });
  if (digits.length < 10 || digits.length > 15) return json(400, { error: 'phone' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'email' });
  if (serviceType === 'mobile' && (address.length < 6 || LINK.test(address))) return json(400, { error: 'address' });
  if (zip && !/^\d{5}$/.test(zip)) return json(400, { error: 'zip' });
  if (LINK.test(notes) || LINK.test(preferredTime)) return json(400, { error: 'links' });

  // The real prices come from the detailer's listing, which only Gleam can edit.
  let d;
  try { d = (await wixAdmin('/wix-data/v2/items/' + encodeURIComponent(detailerId) + '?dataCollectionId=Detailers', undefined, 'GET')).dataItem.data; }
  catch (e) { if (e.status === 404) return json(400, { error: 'detailer' }); throw e; }
  // Mobile (detailer drives to the customer) and/or a shop the customer visits.
  const offersMobile = d.serviceShop ? !!d.serviceMobile : true;
  const offersShop = !!(d.serviceShop && d.shopAddress);
  if (serviceType === 'mobile' && !offersMobile) return json(400, { error: 'not_mobile' });
  if (serviceType === 'shop' && !offersShop) return json(400, { error: 'not_shop' });
  const shopAddress = offersShop ? [d.shopAddress, [d.shopCity, d.shopState].filter(Boolean).join(', '), d.shopZip].filter(Boolean).join(', ') : '';

  const adds = (Array.isArray(d.addons) ? d.addons : []).filter(a => a && a.name && +a.price > 0);
  const idx = [...new Set((Array.isArray(b.addons) ? b.addons : []).map(Number))].filter(i => Number.isInteger(i) && i >= 0 && i < adds.length);
  const picked = idx.map(i => adds[i]);
  let base = 0;
  if (pkg !== 'addons') { base = +d[PRICE_KEY[pkg]]; if (!(base > 0)) return json(400, { error: 'not_offered' }); }
  else if (!picked.length) return json(400, { error: 'pick_addon' });
  const subtotal = r2(base + picked.reduce((s, a) => s + +a.price, 0));
  const serviceFee = r2(subtotal * FEE_RATE), total = r2(subtotal + serviceFee);

  // Slow down floods: at most 5 requests per member per hour.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'BookingRequests',
    query: { filter: { memberId: member.id, _createdDate: { $gt: { $date: since } } }, paging: { limit: MAX_PER_HOUR } } });
  if ((recent.dataItems || []).length >= MAX_PER_HOUR) return json(429, { error: 'too_many' });

  await wixAdmin('/wix-data/v2/items', { dataCollectionId: 'BookingRequests', dataItem: { data: {
    customerName, phone, email, address: serviceType === 'mobile' ? address : '', zip, preferredTime, notes,
    serviceType, ...(serviceType === 'shop' ? { shopName: String(d.shopName || ''), shopAddress } : {}),
    package: NAMES[pkg], detailerId, detailerName: String(d.name || ''),
    price: base, addons: picked.map(a => a.name + ' ' + money(+a.price)).join(' · '),
    subtotal, serviceFee, total, status: 'new', memberId: member.id, memberEmail: member.email, checkedBy: 'server',
  } } });
  return json(200, { ok: true, total });
});

export const config = { path: '/api/book' };
