import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_HASH = 'e87f3d9fbdf91cc69d8fd7ada71c617f6dc93ae6bbe3682c00fce157afa364d2';

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function parseMdxFile(rawContent, filename) {
  const slug = filename.replace(/\.(md|mdx)$/, '');
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { slug, frontmatter: {}, body: rawContent };
  }
  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of yamlBlock.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      frontmatter[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      frontmatter[key] = val === 'true';
    } else {
      frontmatter[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return { slug, frontmatter, body };
}

function buildMdxFile(data) {
  const esc = (str = '') => String(str).replace(/"/g, '\\"');
  const tagsArr = Array.isArray(data.tags)
    ? data.tags.map((t) => `"${esc(t.trim())}"`).join(', ')
    : '';

  const lines = [
    '---',
    `title: "${esc(data.title)}"`,
    `description: "${esc(data.description)}"`,
    `date: "${esc(data.date || new Date().toISOString().slice(0, 10))}"`,
    `category: "${esc(data.category || 'moje-prace')}"`,
    `tags: [${tagsArr}]`,
    `readingTime: "${esc(data.readingTime || '5 min')}"`,
    `featured: ${Boolean(data.featured)}`,
  ];

  if (data.seoTitle) lines.push(`seoTitle: "${esc(data.seoTitle)}"`);
  if (data.seoDescription) lines.push(`seoDescription: "${esc(data.seoDescription)}"`);
  if (data.focusKeyword) lines.push(`focusKeyword: "${esc(data.focusKeyword)}"`);
  if (data.canonicalUrl) lines.push(`canonicalUrl: "${esc(data.canonicalUrl)}"`);
  if (data.ogImage) lines.push(`ogImage: "${esc(data.ogImage)}"`);
  if (data.robots) lines.push(`robots: "${esc(data.robots)}"`);

  lines.push('---', '', data.body || '');
  return lines.join('\n');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function loadSettings(settingsFile) {
  const defaults = {
    maintenanceMode: true,
    maintenanceTitle: 'Strona w budowie',
    maintenanceMessage: 'Trwają prace techniczne nad stroną. Zapraszamy wkrótce!',
    maintenanceProgress: 65,
    allowMojePraceInMaintenance: false,
    adminPasswordHash: DEFAULT_HASH,
  };
  try {
    const raw = await fs.readFile(settingsFile, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function createAdminMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/admin/')) return next();

    const blogDir = path.resolve(process.cwd(), 'src/content/blog');
    const uploadsDir = path.resolve(process.cwd(), 'public/media/uploads');
    const settingsFile = path.resolve(process.cwd(), 'src/data/siteSettings.json');
    const urlObj = new URL(req.url, 'http://localhost');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    try {
      const currentSettings = await loadSettings(settingsFile);
      const expectedHash = currentSettings.adminPasswordHash || DEFAULT_HASH;

      if (urlObj.pathname === '/api/admin/auth' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const candidateHash = payload.passwordHash || sha256(payload.password || '');
        if (candidateHash === expectedHash) {
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, token: expectedHash }));
        } else {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, error: 'Nieprawidłowe hasło administratora.' }));
        }
        return;
      }

      if (urlObj.pathname === '/api/admin/password' && req.method === 'POST') {
        const clientToken = req.headers['x-admin-token'];
        if (clientToken && clientToken !== expectedHash) {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, error: 'Brak autoryzacji – zaloguj się ponownie.' }));
          return;
        }
        const payload = await readJsonBody(req);
        if (!payload.newPassword || String(payload.newPassword).length < 6) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Nowe hasło musi mieć minimum 6 znaków.' }));
          return;
        }
        const newHash = sha256(payload.newPassword);
        const updated = { ...currentSettings, adminPasswordHash: newHash };
        await fs.writeFile(settingsFile, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, token: newHash }));
        return;
      }

      if (urlObj.pathname === '/api/admin/settings' && req.method === 'GET') {
        const { adminPasswordHash, ...publicSettings } = currentSettings;
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, settings: publicSettings }));
        return;
      }

      if (urlObj.pathname === '/api/admin/settings' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        await fs.mkdir(path.dirname(settingsFile), { recursive: true });
        const nextSettings = {
          ...currentSettings,
          maintenanceMode: Boolean(payload.maintenanceMode),
          maintenanceTitle: String(payload.maintenanceTitle || 'Strona w budowie'),
          maintenanceMessage: String(payload.maintenanceMessage || 'Trwają prace techniczne nad stroną. Zapraszamy wkrótce!'),
          maintenanceProgress: Number(payload.maintenanceProgress ?? 65),
          allowMojePraceInMaintenance: Boolean(payload.allowMojePraceInMaintenance),
        };
        await fs.writeFile(settingsFile, JSON.stringify(nextSettings, null, 2) + '\n', 'utf-8');
        const { adminPasswordHash, ...publicSettings } = nextSettings;
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, settings: publicSettings }));
        return;
      }

      if (urlObj.pathname === '/api/admin/posts' && req.method === 'GET') {
        await fs.mkdir(blogDir, { recursive: true });
        const files = await fs.readdir(blogDir);
        const mdxFiles = files.filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
        const posts = [];
        for (const file of mdxFiles) {
          const raw = await fs.readFile(path.join(blogDir, file), 'utf-8');
          posts.push(parseMdxFile(raw, file));
        }
        posts.sort(
          (a, b) =>
            new Date(b.frontmatter.date || 0).getTime() -
            new Date(a.frontmatter.date || 0).getTime()
        );
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, posts }));
        return;
      }

      if (urlObj.pathname === '/api/admin/posts' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const slug = (payload.slug || 'nowy-wpis')
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '');

        await fs.mkdir(blogDir, { recursive: true });
        if (payload.originalSlug && payload.originalSlug !== slug) {
          try {
            await fs.unlink(path.join(blogDir, `${payload.originalSlug}.mdx`));
          } catch {}
        }

        const mdxContent = buildMdxFile(payload);
        const targetPath = path.join(blogDir, `${slug}.mdx`);
        await fs.writeFile(targetPath, mdxContent, 'utf-8');

        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, slug, url: `/blog/${slug}` }));
        return;
      }

      if (urlObj.pathname === '/api/admin/posts' && req.method === 'DELETE') {
        const slug = urlObj.searchParams.get('slug');
        if (!slug) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Brak parametru slug' }));
          return;
        }
        const targetMdx = path.join(blogDir, `${slug}.mdx`);
        await fs.unlink(targetMdx);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (urlObj.pathname === '/api/admin/upload' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const safeName = `${Date.now()}-${(payload.filename || 'plik.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await fs.mkdir(uploadsDir, { recursive: true });
        const base64Data = String(payload.dataUrl || '').replace(/^data:[^;]+;base64,/, '');
        await fs.writeFile(path.join(uploadsDir, safeName), Buffer.from(base64Data, 'base64'));
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, url: `/media/uploads/${safeName}` }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Nie znaleziono endpointu' }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
    }
  };
}

function igorCmsIntegration() {
  return {
    name: 'igor-cms-integration',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(createAdminMiddleware());
      },
    },
  };
}

export default defineConfig({
  site: 'https://igorwielgus.pl',
  integrations: [mdx(), igorCmsIntegration()],
});
