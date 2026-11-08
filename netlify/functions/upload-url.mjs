// Gives a logged-in member a one-time link to upload ONE work photo into the
// "Detailer applications" folder of Gleam's Wix media.
import { handle, memberFrom, sameOrigin, wixAdmin, json } from '../lib/wix.mjs';

const FOLDER = '2f1210d93e2b40ca89a8bd8ccccb6db8';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
const MAX = 25 * 1024 * 1024;

export default handle(async req => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  sameOrigin(req);
  const member = await memberFrom(req);
  const b = await req.json().catch(() => ({}));
  const ext = TYPES[b.mimeType];
  const size = Number(b.sizeInBytes);
  if (!ext) return json(400, { error: 'type' });
  if (!(size > 0 && size <= MAX)) return json(400, { error: 'size' });
  const fileName = 'work-' + member.id.slice(0, 8) + '-' + Date.now() + '.' + ext;
  const d = await wixAdmin('/site-media/v1/files/generate-upload-url', {
    mimeType: b.mimeType, fileName, sizeInBytes: String(size), parentFolderId: FOLDER, private: false,
    labels: ['gleam-application', 'member-' + member.id],
  });
  return json(200, { uploadUrl: d.uploadUrl, fileName });
});

export const config = { path: '/api/upload-url' };
