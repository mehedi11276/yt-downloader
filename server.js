import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { Innertube } from 'youtubei.js';

// Write cookies from env variable on startup
if (process.env.COOKIES_BASE64) {
  const buf = Buffer.from(process.env.COOKIES_BASE64, 'base64');
  await writeFile('cookies.txt', buf);
  console.log('✅ cookies.txt written from env, size:', buf.length, 'bytes');
} else {
  console.log('⚠️ No COOKIES_BASE64 env variable found!');
}

const yt = await Innertube.create({ retrieve_player: true });

function extractVideoId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || u.pathname.split('/').pop();
  } catch {
    return null;
  }
}

function getLabel(height) {
  if (height >= 2160) return `4K (${height}p)`;
  if (height >= 1440) return `1440p`;
  if (height >= 1080) return `1080p`;
  if (height >= 720) return `720p`;
  if (height >= 480) return `480p`;
  if (height >= 360) return `360p`;
  return `${height}p`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && url.pathname === '/') {
    const html = await readFile('index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  if (req.method === 'POST' && url.pathname === '/formats') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { url: videoUrl } = JSON.parse(body);
        const videoId = extractVideoId(videoUrl);
        if (!videoId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Invalid URL' })); }

        const info = await yt.getBasicInfo(videoId);
        const streamingData = info.streaming_data;

        if (!streamingData) {
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'No streaming data found.' }));
        }

        const formats = [
          ...(streamingData.formats || []),
          ...(streamingData.adaptive_formats || [])
        ]
          .filter(f => f.height && f.url && f.mime_type?.includes('video/mp4'))
          .sort((a, b) => b.height - a.height)
          .filter((f, i, arr) => arr.findIndex(x => x.height === f.height) === i)
          .map(f => ({ label: getLabel(f.height), url: f.url }));

        const title = info.basic_info?.title || 'Unknown Title';
        const thumbnail = info.basic_info?.thumbnail?.[0]?.url || '';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title, thumbnail, formats }));
      } catch(e) {
        console.error(e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, () => console.log('✅ Running at http://localhost:3000'));