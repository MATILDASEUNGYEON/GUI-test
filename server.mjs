import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  isScreensFile,
  extractStyleCss,
  extractScreens,
  reinjectBodies
} from './screens.mjs';

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

    // SCREENS 기반 SPA: 각 화면 body를 편집 가능한 페이지로 펼친다.
    if (isScreensFile(html)) {
      const styleCss = extractStyleCss(html);
      const screens = extractScreens(html);
      const styleTag = styleCss ? `<style>${styleCss}</style>` : '';

      res.json({
        kind: 'screens',
        // 화면 순서/식별자 (클라이언트가 페이지를 매핑할 때 참고)
        screens: screens.map((s) => ({ id: s.id, title: s.title })),
        project: {
          pages: screens.map((s) => ({
            // 페이지 이름 = 화면 id (저장 시 매핑 키)
            name: s.id,
            // 디자인 시스템 CSS를 함께 넣어 캔버스에서 제대로 렌더되게 한다.
            // GrapesJS는 <style>을 CSS로 추출하므로 body 추출에는 섞이지 않는다.
            component: `${styleTag}${s.body || ''}`
          }))
        }
      });
      return;
    }

    // 일반 HTML 파일: 단일 페이지로 로드.
    res.json({
      kind: 'html',
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
    const { html, pages } = req.body;

    // SCREENS 기반 SPA: 편집된 페이지 HTML을 원본 SCREENS[i].body에 재주입.
    if (Array.isArray(pages)) {
      const source = await fs.readFile(htmlPath(file), 'utf8');

      if (!isScreensFile(source)) {
        throw new Error('pages 저장은 SCREENS 기반 파일에만 사용할 수 있습니다.');
      }

      // 원본 화면 순서를 기준으로 편집 HTML을 정렬한다.
      const screens = extractScreens(source);
      const byId = new Map(
        pages
          .filter((p) => p && typeof p.html === 'string')
          .map((p) => [p.id, p.html])
      );
      const sameCount = pages.length === screens.length;

      const orderedHtmls = screens.map((s, i) => {
        // 1) id 매핑 우선
        if (byId.has(s.id)) return byId.get(s.id);
        // 2) 개수가 같으면 순서 매핑 (page.getName() 미동작 대비 폴백)
        if (sameCount && typeof pages[i]?.html === 'string') return pages[i].html;
        // 3) 둘 다 불가하면 기존 body 유지
        return s.body || '';
      });

      const next = reinjectBodies(source, orderedHtmls);
      await fs.writeFile(htmlPath(file), next, 'utf8');

      res.json({ ok: true, file: path.join('sample', file), kind: 'screens' });
      return;
    }

    // 일반 HTML 파일: 전체 문서를 그대로 덮어쓴다.
    if (typeof html !== 'string') {
      throw new Error('html (또는 pages) is required');
    }

    await fs.writeFile(htmlPath(file), html, 'utf8');

    res.json({ ok: true, file: path.join('sample', file), kind: 'html' });
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
