import createStudioEditor from '@grapesjs/studio-sdk';
import '@grapesjs/studio-sdk/style';
import './style.css';

const fileSelect = document.querySelector('#fileSelect');
const saveBtn = document.querySelector('#saveBtn');
const statusEl = document.querySelector('#status');

let editor = null;
let currentFile = null;
let currentKind = 'html'; // 'html' | 'screens'

function setStatus(message) {
  statusEl.textContent = message;
}

async function apiGet(url) {
  const res = await fetch(url);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `GET ${url} failed`);
  }

  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `POST ${url} failed`);
  }

  return res.json();
}

/*
  편집 결과를 디스크에 반영한다. autosave(onSave)와 수동 저장 버튼이 공통 사용.

  - 'screens' : SCREENS 기반 SPA. 각 GrapesJS 페이지 = 한 화면.
                페이지별 body HTML을 모아 서버가 원본 SCREENS[i].body에 재주입.
  - 'html'    : 일반 HTML 파일. 전체 문서를 재조립해 그대로 저장.
*/
async function saveToDisk(ed) {
  if (!ed || !currentFile) {
    return;
  }

  if (currentKind === 'screens') {
    const pages = ed.Pages.getAll().map((page) => ({
      // 페이지 이름 = 화면 id (서버 로드 시 그렇게 지정함)
      id: page.getName() || page.getId(),
      html: ed.getHtml({ component: page.getMainComponent() })
    }));

    await apiPost('/api/export-html', { file: currentFile, pages });
    return;
  }

  // 일반 HTML: 단일 페이지를 전체 문서로 재조립
  const page = ed.Pages.getAll()[0] ?? ed.Pages.getSelected();
  const component = page ? page.getMainComponent() : undefined;

  const bodyHtml = ed.getHtml(component ? { component } : undefined);
  const css = ed.getCss(component ? { component } : undefined) || '';

  const doc = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${css}</style>
  </head>
  <body>${bodyHtml}</body>
</html>
`;

  await apiPost('/api/export-html', { file: currentFile, html: doc });
}

/*
  파일 목록을 드롭다운에 채우고, 현재 선택 파일을 결정한다.
  선택 파일은 URL ?file= 으로 관리한다 (전환 시 페이지를 리로드해
  매번 깨끗한 에디터 인스턴스를 보장한다).
*/
async function resolveFiles() {
  const { files } = await apiGet('/api/files');

  fileSelect.innerHTML = '';

  for (const file of files) {
    const option = document.createElement('option');
    option.value = file;
    option.textContent = file;
    fileSelect.appendChild(option);
  }

  if (!files.length) {
    setStatus('sample/ 폴더에 .html 파일이 없습니다.');
    saveBtn.disabled = true;
    return null;
  }

  const requested = new URLSearchParams(location.search).get('file');
  const selected = files.includes(requested) ? requested : files[0];

  fileSelect.value = selected;
  saveBtn.disabled = false;

  return selected;
}

async function initEditor(file) {
  currentFile = file;
  setStatus(`${file} 로딩 중...`);

  // 항상 디스크의 .html을 단일 진실 원본으로 로드한다.
  const { project, kind } = await apiGet(
    `/api/project?file=${encodeURIComponent(file)}`
  );

  currentKind = kind || 'html';

  await createStudioEditor({
    root: '#studio',

    /*
      운영 환경에서는 GrapesJS Studio SDK 라이선스 키를 설정하세요.
      예:
      licenseKey: import.meta.env.VITE_GRAPESJS_LICENSE_KEY,
    */

    project: {
      type: 'web'
    },

    // createStudioEditor는 void를 반환하므로 인스턴스는 콜백으로 받는다.
    onEditor: (ed) => {
      editor = ed;
    },

    storage: {
      type: 'self',
      autosaveChanges: 10,
      autosaveIntervalMs: 10000,

      onLoad: async () => {
        return { project };
      },

      // 수정 내용을 곧바로 원본 파일에 반영한다.
      onSave: async ({ editor: ed }) => {
        await saveToDisk(ed ?? editor);
        const label =
          currentKind === 'screens'
            ? `${currentFile} SCREENS 반영 완료`
            : `${currentFile} HTML 반영 완료`;
        setStatus(label);
      }
    }
  });

  const hint =
    currentKind === 'screens'
      ? `${file} 편집 준비 완료 — 좌측 페이지 목록에서 화면을 전환하세요`
      : `${file} 편집 준비 완료`;
  setStatus(hint);
}

async function saveNow() {
  if (!editor || !currentFile) {
    return;
  }

  setStatus(`${currentFile} 저장 중...`);
  await saveToDisk(editor);
  setStatus(`sample/${currentFile} 저장 완료`);
}

// 파일 전환: URL을 바꾸고 리로드 → 깨끗한 에디터로 다시 시작
fileSelect.addEventListener('change', () => {
  const params = new URLSearchParams(location.search);
  params.set('file', fileSelect.value);
  location.search = params.toString();
});

saveBtn.addEventListener('click', async () => {
  try {
    await saveNow();
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

(async () => {
  try {
    const file = await resolveFiles();
    if (file) {
      await initEditor(file);
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
})();
