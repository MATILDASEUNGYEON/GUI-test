import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const SAMPLE_DIR = path.join(ROOT_DIR, 'sample');

const app = express();

app.use(express.json({ limit: '50mb' }));

function assertSafeHtmlFile(file) {
  if (!file || typeof file !== 'string') {
    throw new Error('file is required');
  }

  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw new Error('invalid file path');
  }

  if (!file.endsWith('.html')) {
    throw new Error('only .html files are allowed');
  }

  return file;
}

function htmlPath(file) {
  return path.join(SAMPLE_DIR, file);
}

app.get('/api/files', async (req, res) => {
  try {
    await fs.mkdir(SAMPLE_DIR, { recursive: true });

    const files = await fs.readdir(SAMPLE_DIR);
    const htmlFiles = files
      .filter((file) => file.endsWith('.html'))
      .sort();

    res.json({ files: htmlFiles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/project', async (req, res) => {
  try {
    const file = assertSafeHtmlFile(req.query.file);

    // 디스크의 .html을 항상 단일 진실 원본으로 로드한다.
    const html = await fs.readFile(htmlPath(file), 'utf8');

    res.json({
      project: {
        pages: [
          {
            name: path.basename(file, '.html'),
            component: html
          }
        ]
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/export-html', async (req, res) => {
  try {
    const file = assertSafeHtmlFile(req.body.file);
    const { html } = req.body;

    if (typeof html !== 'string') {
      throw new Error('html is required');
    }

    await fs.writeFile(htmlPath(file), html, 'utf8');

    res.json({
      ok: true,
      file: path.join('sample', file)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const vite = await createViteServer({
  root: ROOT_DIR,
  server: {
    middlewareMode: true
  }
});

app.use(vite.middlewares);

const port = process.env.PORT || 5188;

app.listen(port, () => {
  console.log(`Editor running at http://localhost:${port}`);
});
