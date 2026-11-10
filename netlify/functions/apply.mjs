// Saves a detailer application for the logged-in member. Only known fields are kept.
import { handle, memberFrom, sameOrigin, wixAdmin, json, clip, LINK } from '../lib/wix.mjs';

const MAX_PER_DAY = 3;
const price = v => { const n = Math.round(Number(v) * 100) / 100; return n > 0 && n <= 5000 ? n : undefined; };
const txt = (v, max) => { const s = clip(v, max); return LINK.test(s) ? null : s; };

export default handle(async req => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  const b = await req.json().catch(() => ({}));

  const d = {
    name: txt(b.name, 80), email: clip(b.email, 120), phone: clip(b.phone, 30), about: txt(b.about, 400),
    address: txt(b.address, 150), zip: clip(b.zip, 5), city: txt(b.city, 60), state: clip(b.state, 2).toUpperCase(),
    radiusMiles: [5, 10, 15, 25, 40].includes(Number(b.radiusMiles)) ? Number(b.radiusMiles) : 10,
    priceExterior: price(b.priceExterior), priceInterior: price(b.priceInterior), priceFull: price(b.priceFull),
    serviceMobile: !!b.serviceMobile, serviceShop: !!b.serviceShop,
  };
  if (Object.values(d).some(v => v === null)) return json(400, { error: 'links' });
  if (!d.name || d.name.length < 2) return json(400, { error: 'name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return json(400, { error: 'email' });
  const digits = d.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return json(400, { error: 'phone' });
  if (!/^\d{5}$/.test(d.zip)) return json(400, { error: 'zip' });
  if (!d.serviceMobile && !d.serviceShop) return json(400, { error: 'how_you_work' });
  if (d.serviceShop) {
    Object.assign(d, { shopName: txt(b.shopName, 80), shopAddress: txt(b.shopAddress, 120), shopZip: clip(b.shopZip, 5), shopCity: txt(b.shopCity, 60), shopState: clip(b.shopState, 2).toUpperCase() });
    if (!d.shopName || d.shopName.length < 2) return json(400, { error: 'shop_name' });
    if (!d.shopAddress || d.shopAddress.length < 5) return json(400, { error: 'shop_address' });
    if (!/^\d{5}$/.test(d.shopZip)) return json(400, { error: 'shop_zip' });
  }
  const addons = (Array.isArray(b.addons) ? b.addons : []).slice(0, 12).map(a => ({ name: txt(a && a.name, 40), description: txt(a && a.description, 140) || '', price: price(a && a.price) }))
    .filter(a => a.name && a.price);
  if (addons.length) { d.addons = addons; d.addonsSummary = addons.map(a => a.name + ' $' + a.price).join(' · '); d.priceAddons = Math.min(...addons.map(a => a.price)); }
  if (!d.priceExterior && !d.priceInterior && !d.priceFull && !addons.length) return json(400, { error: 'prices' });
  const photos = (Array.isArray(b.workPhotos) ? b.workPhotos : []).filter(u => /^https:\/\/static\.wixstatic\.com\/media\/[\w~.-]+$/.test(String(u))).slice(0, 8);
  if (!photos.length) return json(400, { error: 'photos' });
  d.workPhotos = photos;

  const since = new Date(Date.now() - 86400_000).toISOString();
  const recent = await wixAdmin('/wix-data/v2/items/query', { dataCollectionId: 'DetailerApplications',
    query: { filter: { memberId: member.id, _createdDate: { $gt: { $date: since } } }, paging: { limit: MAX_PER_DAY } } });
  if ((recent.dataItems || []).length >= MAX_PER_DAY) return json(429, { error: 'too_many' });

  for (const k of Object.keys(d)) if (d[k] === undefined || d[k] === '') delete d[k];
  await wixAdmin('/wix-data/v2/items', { dataCollectionId: 'DetailerApplications', dataItem: { data: { ...d, status: 'pending', memberId: member.id, memberEmail: member.email } } });
  return json(200, { ok: true });
});

export const config = { path: '/api/apply' };
