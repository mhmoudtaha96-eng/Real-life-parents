// Turns a pasted video link (Instagram, YouTube, TikTok, Facebook) into something the page can embed.
// Shared by the admin page (preview) and the server (validation before saving).
export function parseVideo(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const idOk = (x) => typeof x === 'string' && /^[\w-]{5,40}$/.test(x);

  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => ['reel', 'reels', 'p', 'tv'].includes(p));
    const id = i >= 0 ? parts[i + 1] : null;
    if (!idOk(id)) return null;
    const kind = parts[i] === 'p' ? 'p' : 'reel';
    return { provider: 'instagram', id, vertical: true, embed: `https://www.instagram.com/${kind}/${id}/embed/`, url: `https://www.instagram.com/${kind}/${id}/` };
  }
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = null, vertical = false;
    if (host === 'youtu.be') id = parts[0];
    else if (parts[0] === 'shorts') { id = parts[1]; vertical = true; }
    else if (parts[0] === 'embed' || parts[0] === 'live') id = parts[1];
    else id = url.searchParams.get('v');
    if (!idOk(id)) return null;
    return { provider: 'youtube', id, vertical, embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, url: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}` };
  }
  if (host === 'tiktok.com') {
    const i = parts.indexOf('video');
    const id = i >= 0 ? parts[i + 1] : null;
    if (!id || !/^\d{8,25}$/.test(id)) return null;
    return { provider: 'tiktok', id, vertical: true, embed: `https://www.tiktok.com/embed/v2/${id}`, url: url.origin + url.pathname };
  }
  if (host === 'facebook.com' || host === 'fb.watch') {
    const clean = url.origin + url.pathname + (url.searchParams.get('v') ? `?v=${url.searchParams.get('v')}` : '');
    const vertical = parts.includes('reel');
    return { provider: 'facebook', id: clean, vertical, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clean)}&show_text=false`, url: clean };
  }
  return null;
}
