import { createServer } from 'http';
import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

// Write cookies from env variable on startup
if (process.env.COOKIES_BASE64) {
  const buf = Buffer.from(process.env.COOKIES_BASE64, 'base64');
  await writeFile('cookies.txt', buf);
  console.log('✅ cookies.txt written from env, size:', buf.length, 'bytes');
} else {
  console.log('⚠️ No COOKIES_BASE64 env variable found!');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && url.pathname === '/') {
    const html = await readFile('index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  if (req.method === 'POST' && url.pathname === '/formats') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      const { url: videoUrl } = JSON.parse(body);
      if (!videoUrl) { res.writeHead(400); return res.end('No URL'); }

      const ytdlp = spawn('yt-dlp', [
        '-J',
        '--no-warnings',
        '--no-playlist',
        '--cookies', 'cookies.txt',
        '--extractor-args', 'youtube:player_client=web',
        videoUrl
      ]);
      let data = '';

      const timeout = setTimeout(() => {
        ytdlp.kill();
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Timed out!' }));
      }, 30000);

      ytdlp.stdout.on('data', (d) => data += d);
      ytdlp.stderr.on('data', (d) => console.log('STDERR:', d.toString()));

      ytdlp.on('close', () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(data);
          const videoFormats = json.formats
            .filter(f => f.height && f.vcodec !== 'none' && f.url)
            .sort((a, b) => b.height - a.height)
            .filter((f, i, arr) => arr.findIndex(x => x.height === f.height) === i)
            .map(f => ({ height: f.height, label: getLabel(f.height, f.ext.toUpperCase()), url: f.url }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ title: json.title, thumbnail: json.thumbnail, formats: videoFormats }));
        } catch(e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function getLabel(height, ext) {
  if (height >= 2160) return `4K - ${ext}`;
  if (height >= 1440) return `1440p - ${ext}`;
  if (height >= 1080) return `1080p - ${ext}`;
  if (height >= 720) return `720p - ${ext}`;
  if (height >= 480) return `480p - ${ext}`;
  if (height >= 360) return `360p - ${ext}`;
  if (height >= 240) return `240p - ${ext}`;
  return `${height}p - ${ext}`;
}

server.listen(3000, () => console.log('✅ Running at http://localhost:3000'));