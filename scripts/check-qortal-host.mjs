// Local integration check: production dist + actual pinned Core q-apps.js.
// Network data and the Hub approval response are fixtures; no QDN writes occur.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright')
    : 'playwright',
);
const root = resolve(import.meta.dirname, '..');
const core = process.env.QORTAL_CORE_ROOT;
assert(core, 'Set QORTAL_CORE_ROOT to the audited Qortal Core source checkout.');
const coreCommit = execFileSync('git', ['-C', core, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
assert.equal(coreCommit, '108bf191d42d710ec617f535af30cfd82fc03c87');
const coreScript = await readFile(join(core, 'src/main/resources/q-apps/q-apps.js'));
const distHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
const publisher = 'Port Station';
const base = `/render/APP/${encodeURIComponent(publisher)}`;
const owner = 'Q-fixture-owner';
const now = new Date().toISOString();
const durationMs = 8_000;
const tracks = ['one', 'two'].map((id) => ({
  schemaVersion: 1,
  trackId: id,
  ownerAddress: owner,
  title: `Fixture ${id}`,
  artist: 'Qortal host check',
  durationMs,
  source: 'station-upload',
  audio: { service: 'AUDIO', name: publisher, identifier: `nodefm-audio-${id}` },
  cover: { service: 'IMAGE', name: publisher, identifier: 'nodefm-cover-one' },
  createdAt: now,
  updatedAt: now,
}));
const version = {
  schemaVersion: 1,
  playlistId: 'rotation',
  versionId: 'v1',
  versionNumber: 1,
  createdBy: owner,
  createdAt: now,
  tracks: tracks.map(({ trackId, durationMs }) => ({ trackId, durationMs })),
  totalDurationMs: durationMs * 2,
};
const playlist = {
  schemaVersion: 1,
  playlistId: 'rotation',
  ownerAddress: owner,
  title: 'Fixture rotation',
  visibility: 'public',
  latestVersionId: 'v1',
  createdAt: now,
  updatedAt: now,
};
const station = {
  schemaVersion: 1,
  stationId: 'fixture',
  name: 'Qortal Fixture Radio',
  publisherName: publisher,
  ownerAddress: owner,
  timezone: 'Europe/Helsinki',
  defaultRotationPlaylistId: 'rotation',
  defaultRotationPlaylistVersionId: 'v1',
  stationEpochUtc: new Date(Date.now() - 1500).toISOString(),
  messagingEnabled: false,
  tipsEnabled: false,
  createdAt: now,
  updatedAt: now,
};
const resources = [
  ['JSON', 'nodefm-station-config', station],
  ['JSON', 'nodefm-playlist-version-v1', version],
  ['PLAYLIST', 'nodefm-playlist-rotation', playlist],
  ...tracks.map((track) => ['JSON', `nodefm-track-${track.trackId}`, track]),
];
// Small real PCM media, allowing Chromium to exercise loading/seek/Range.
const rate = 8000;
const frames = (rate * durationMs) / 1000;
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  wav.writeInt16LE(Math.round(180 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + 2 * i);
const requests = [];
const authRequests = [];
let mode = 'ready';
let rejectAuthentication = false;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    const path = decodeURIComponent(url.pathname);
    requests.push({ path, search: url.search, range: req.headers.range ?? null });
    const json = (value, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (path === '/apps/q-apps.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(coreScript);
      return;
    }
    if (path === `/names/${publisher}`) return json({ name: publisher, owner });
    if (path === `/names/address/${owner}`)
      return json([{ name: 'Other name' }, { name: publisher }]);
    if (path === '/arbitrary/resources/search') {
      return json(
        resources
          .filter(
            ([service, id]) =>
              service === url.searchParams.get('service') &&
              id.startsWith(url.searchParams.get('query') ?? '') &&
              (!url.searchParams.get('name') || url.searchParams.get('name') === publisher),
          )
          .map(([service, identifier]) => ({ service, name: publisher, identifier })),
      );
    }
    if (path.startsWith('/arbitrary/resource/status/'))
      return json({ status: 'READY', totalChunkCount: 1 });
    const resourceMatch = path.match(/^\/arbitrary\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (resourceMatch) {
      const [, service, name, id] = resourceMatch;
      assert.equal(name, publisher);
      if (id === 'nodefm-station-config' && mode === 'absent')
        return json({ error: 1401, message: "Couldn't find PUT transaction" }, 404);
      if (id === 'nodefm-station-config' && mode === 'offline')
        return json({ error: 500, message: 'fixture node unavailable' }, 503);
      if (service === 'AUDIO') {
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
        const headers = {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        };
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${wav.length}`;
        res.writeHead(range ? 206 : 200, headers);
        res.end(wav.subarray(start, end + 1));
        return;
      }
      if (service === 'IMAGE') {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#265899"/></svg>',
        );
        return;
      }
      const record = resources.find(([s, i]) => s === service && i === id);
      if (record) return json(record[2]);
      return json({ error: 1401, message: "Couldn't find PUT transaction" }, 404);
    }
    const asset = url.pathname.match(/\/assets\/([^/]+)$/);
    if (asset) {
      res.setHeader('Content-Type', asset[1].endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(await readFile(join(root, 'dist/assets', asset[1])));
      return;
    }
    if (path.startsWith('/render/APP/')) {
      const bootstrap = `<base href="${base}/"><script>var _qdnContext='render',_qdnTheme='dark',_qdnLang='en',_qdnService='APP',_qdnName=${JSON.stringify(publisher)},_qdnIdentifier='',_qdnPath='/',_qdnBase=${JSON.stringify(base)};</script><script src="/apps/q-apps.js"></script>`;
      res.setHeader('Content-Type', 'text/html');
      res.end(distHtml.replace('<head>', `<head>${bootstrap}`));
      return;
    }
    if (path === '/') {
      mode = url.searchParams.get('fixture') || 'ready';
      rejectAuthentication = url.searchParams.get('auth') === 'decline';
      // Hub-side response shape and origin/source/MessagePort boundary. Core
      // handles public reads itself; this parent only supplies explicit auth.
      const frame = `<iframe title="NodeFM" style="border:0;width:100%;height:100vh" src="${base}/"></iframe>`;
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<body style="margin:0">${frame}<script>window.addEventListener('message',async e=>{if(e.source!==document.querySelector('iframe').contentWindow||e.origin!==location.origin||e.data?.requestedHandler!=='UI')return;if(e.data.action==='GET_USER_ACCOUNT'){await fetch('/auth-observed');const denied=await (await fetch('/auth-mode')).json();e.ports[0].postMessage(denied?{error:{error:'USER_DECLINED',message:'Account access declined'}}:{result:{address:${JSON.stringify(owner)},publicKey:'fixture-key'},error:null});}})</script></body>`,
      );
      return;
    }
    if (path === '/auth-observed') {
      authRequests.push(true);
      return json(true);
    }
    if (path === '/auth-mode') return json(rejectAuthentication);
    res.writeHead(404);
    res.end();
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
if (process.env.HOST_CHECK_SERVE_ONLY === '1') {
  console.log(`Qortal host fixture: ${url}`);
  await new Promise(() => {});
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const checks = [];
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(url);
  const app = page.frameLocator('iframe');
  await app.getByText('Qortal Fixture Radio', { exact: true }).first().waitFor();
  await app
    .locator('.player-bar__track')
    .filter({ hasText: /Fixture (one|two)/ })
    .waitFor();
  await app.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  await app.getByRole('link', { name: 'Admin', exact: true }).waitFor();
  assert(authRequests.length >= 1);
  const frame = page.frames()[1];
  assert.equal(await frame.evaluate(() => typeof window.qortalRequest), 'undefined');
  assert.equal(await frame.evaluate(() => typeof qortalRequest), 'function');
  checks.push(
    'Actual Core lexical bridge; automatic Hub account and publisher discovery; encoded publisher name',
  );
  await app.getByRole('button', { name: 'Pause', exact: true }).last().waitFor();
  await page.waitForFunction(() => true);
  const initial = await app.locator('.player-bar__track').innerText();
  await page.waitForFunction(
    (initial) =>
      document.querySelector('iframe').contentDocument.querySelector('.player-bar__track')
        .textContent !== initial,
    initial,
    { timeout: 14000 },
  );
  checks.push('Real audio playback, live seek and deterministic track transition');
  await app.getByRole('button', { name: 'Pause', exact: true }).last().click();
  await app.getByRole('button', { name: 'Play', exact: true }).last().waitFor();
  await app.getByRole('button', { name: 'Play', exact: true }).last().click();
  await app.getByRole('button', { name: 'Pause', exact: true }).last().waitFor();
  checks.push('Live pause/resume');
  await app.getByRole('button', { name: 'Sign out', exact: true }).click();
  const authBeforeRetry = authRequests.length;
  rejectAuthentication = true;
  await app.getByRole('button', { name: 'Connect Qortal account' }).click();
  await app.getByRole('alert').filter({ hasText: 'Account access declined' }).waitFor();
  assert.equal(authRequests.length, authBeforeRetry + 1);
  rejectAuthentication = false;
  await app.getByRole('button', { name: 'Connect Qortal account' }).click();
  await app.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
  await app.getByRole('link', { name: 'Admin', exact: true }).waitFor();
  assert.equal(authRequests.length, authBeforeRetry + 2);
  checks.push(
    'Denied approval does not retry; explicit authentication resolves all registered names',
  );
  await app.getByRole('button', { name: 'Sign out', exact: true }).click();
  assert.equal(await app.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
  await app.getByRole('link', { name: 'Playlists', exact: true }).click();
  await app.getByText('Fixture rotation', { exact: true }).first().click();
  await app.getByRole('button', { name: 'Listen to Playlist', exact: true }).click();
  await app.locator('.player-bar__status').filter({ hasText: 'PLAYLIST' }).waitFor();
  await app.getByRole('button', { name: 'Next track', exact: true }).last().click();
  await app.locator('.player-bar__track').filter({ hasText: 'Fixture two' }).waitFor();
  checks.push('Public playlist discovery/detail, playback and next track');
  await page.reload();
  await app.getByText('Fixture rotation', { exact: true }).first().waitFor();
  checks.push('Deep-route reload under Core basename');
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page
    .frames()[1]
    .evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'Mobile viewport should not scroll horizontally');
  checks.push('390px foreground layout');
  await mkdir(join(root, 'reports'), { recursive: true });
  await page.screenshot({ path: join(root, 'reports/qortal-phase1-mobile.png') });
  mode = 'absent';
  await page.goto(`${url}/?fixture=absent`);
  await app.getByText('No station configured', { exact: false }).first().waitFor();
  await app.getByRole('link', { name: 'Admin', exact: true }).waitFor();
  checks.push('Confirmed missing station stays unconfigured; no foreign-publisher fallback');
  mode = 'offline';
  await page.goto(`${url}/?fixture=offline`);
  await app.getByText('Station data unavailable', { exact: false }).first().waitFor();
  assert.equal(await app.getByText('No station configured', { exact: false }).count(), 0);
  checks.push('Node failure stays an error, never a claimable empty station');
  assert(
    requests.some((req) => req.path.startsWith('/arbitrary/AUDIO/') && req.range),
    'Browser must request ranged audio',
  );
  assert.equal(failures.length, 0, failures.join('\n'));
  const report = {
    coreCommit,
    checks,
    rangeRequests: requests.filter((req) => req.range).length,
    authRequests: authRequests.length,
    pageErrors: failures,
    liveNetwork: false,
    nativeHub: false,
  };
  await writeFile(
    join(root, 'reports/qortal-phase1-host-check.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
