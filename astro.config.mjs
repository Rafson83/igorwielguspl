import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import fs from 'node:fs/promises';
import path from 'node:path';

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

function cmsAdminApiPlugin() {
  return {
    name: 'igor-cms-admin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/admin/')) return next();

        const blogDir = path.resolve(process.cwd(), 'src/content/blog');
        const uploadsDir = path.resolve(process.cwd(), 'public/media/uploads');
        const settingsFile = path.resolve(process.cwd(), 'src/data/siteSettings.json');
        const urlObj = new URL(req.url, 'http://localhost');

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          if (urlObj.pathname === '/api/admin/settings' && req.method === 'GET') {
            let settings = {
              maintenanceMode: false,
              maintenanceTitle: 'Strona w budowie – Trwają prace w warsztacie!',
              maintenanceMessage: 'Blog osobisty Igora Wielgusa jest aktualnie w trakcie rozbudowy.',
              maintenanceProgress: 65,
              allowMojePraceInMaintenance: true,
            };
            try {
              const raw = await fs.readFile(settingsFile, 'utf-8');
              settings = { ...settings, ...JSON.parse(raw) };
            } catch {}
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, settings }));
            return;
          }

          if (urlObj.pathname === '/api/admin/settings' && req.method === 'POST') {
            const payload = await readJsonBody(req);
            await fs.mkdir(path.dirname(settingsFile), { recursive: true });
            const nextSettings = {
              maintenanceMode: Boolean(payload.maintenanceMode),
              maintenanceTitle: String(payload.maintenanceTitle || 'Strona w budowie – Trwają prace w warsztacie!'),
              maintenanceMessage: String(payload.maintenanceMessage || 'Blog osobisty Igora Wielgusa jest aktualnie w trakcie rozbudowy.'),
              maintenanceProgress: Number(payload.maintenanceProgress ?? 65),
              allowMojePraceInMaintenance: Boolean(payload.allowMojePraceInMaintenance),
            };
            await fs.writeFile(settingsFile, JSON.stringify(nextSettings, null, 2) + '\n', 'utf-8');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, settings: nextSettings }));
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
      });
    },
  };
}

export default defineConfig({
  site: 'https://igorwielgus.pl',
  integrations: [mdx()],
  vite: {
    plugins: [cmsAdminApiPlugin()],
  },
});
