import { createServer } from 'http';
import { readFile } from 'fs/promises';

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT = {
  clientName: 'ANDROID',
  clientVersion: '19.09.37',
  androidSdkVersion: 30,
  userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
};

async function getVideoInfo(videoId) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_CLIENT.userAgent,
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': INNERTUBE_CLIENT.clientVersion,
    },
    body: JSON.stringify({
      videoId,
      context: {
        client: INNERTUBE_CLIENT
      }
    })
  });
  return res.json();
}

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

        const data = await getVideoInfo(videoId);

        if (!data.streamingData) {
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'No streaming data found. Video may be restricted.' }));
        }

        const formats = [
          ...(data.streamingData.formats || []),
          ...(data.streamingData.adaptiveFormats || [])
        ]
          .filter(f => f.qualityLabel && f.url && f.mimeType?.includes('video/mp4'))
          .sort((a, b) => (b.width || 0) - (a.width || 0))
          .filter((f, i, arr) => arr.findIndex(x => x.qualityLabel === f.qualityLabel) === i)
          .map(f => ({ label: f.qualityLabel, url: f.url }));

        const title = data.videoDetails?.title || 'Unknown Title';
        const thumbnail = data.videoDetails?.thumbnail?.thumbnails?.pop()?.url || '';

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