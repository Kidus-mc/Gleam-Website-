// Booking alerts by email (Resend) and text (Twilio).
// Each channel switches on by itself once its keys are added in Netlify → Site configuration →
// Environment variables. Until then it's skipped quietly. Keys never go in the code.
//
//   RESEND_API_KEY      email: from resend.com → API Keys
//   NOTIFY_FROM         email "from", e.g. "Gleam <bookings@gleamdetailing.com>" (a domain verified in Resend)
//   TWILIO_ACCOUNT_SID  text: from the Twilio console
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM         the Twilio phone number, e.g. +12025550123
//   ADMIN_EMAIL         where Gleam's own copy of every booking goes (optional)
//   ADMIN_PHONE         Gleam's own text copy (optional)

const env = k => (process.env[k] || '').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITE = 'https://allgleam.netlify.app';

export function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d.length >= 11 && d.length <= 15 ? '+' + d : '';
}

export async function sendEmail(to, subject, lines) {
  const key = env('RESEND_API_KEY');
  if (!key || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return 'skipped';
  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111">' +
    lines.map(l => l === '' ? '<br>' : '<p style="margin:0 0 6px">' + esc(l) + '</p>').join('') +
    '<p style="margin:16px 0 0"><a href="' + SITE + '/account.html" style="color:#ff3b1d">Open your Gleam account</a></p></div>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('NOTIFY_FROM') || 'Gleam <onboarding@resend.dev>', to: [to], subject, html, text: lines.join('\n') + '\n\n' + SITE + '/account.html' }),
  });
  return r.ok ? 'sent' : 'failed';
}

export async function sendText(to, body) {
  const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_FROM');
  const num = toE164(to);
  if (!sid || !tok || !from || !num) return 'skipped';
  const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid) + '/Messages.json', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(sid + ':' + tok), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: num, From: from, Body: body.slice(0, 600) }),
  });
  return r.ok ? 'sent' : 'failed';
}

// Never let an alert slow down or break the thing that triggered it.
export function quietly(ctx, work) {
  const p = Promise.race([Promise.allSettled(work), new Promise(r => setTimeout(r, 8000))]);
  if (ctx && typeof ctx.waitUntil === 'function') { ctx.waitUntil(p); return Promise.resolve(); }
  return p;
}

export const adminEmail = () => env('ADMIN_EMAIL');
export const adminPhone = () => env('ADMIN_PHONE');
