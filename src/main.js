import createStudioEditor from '@grapesjs/studio-sdk';
import '@grapesjs/studio-sdk/style';
import './style.css';

const fileSelect = document.querySelector('#fileSelect');
const saveBtn = document.querySelector('#saveBtn');
const statusEl = document.querySelector('#status');

let editor = null;
let currentFile = null;

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
  현재 편집 상태를 HTML로 export 해서 sample/원본.html에 덮어쓴다.
  autosave(onSave)와 수동 저장 버튼이 공통으로 사용한다.
*/
async function exportHtml(editorInstance) {
  if (!editorInstance || !currentFile) {
    return;
  }

  const files = await editorInstance.runCommand('studio:projectFiles', {
    styles: 'inline',
    skipProject: true
  });

  const htmlFile = files.find((file) => file.mimeType === 'text/html');

  if (!htmlFile) {
    throw new Error('export된 HTML 파일을 찾지 못했습니다.');
  }

  await apiPost('/api/export-html', {
    file: currentFile,
    html: htmlFile.content
  });
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
  const { project } = await apiGet(
    `/api/project?file=${encodeURIComponent(file)}`
  );

  editor = await createStudioEditor({
    root: '#studio',

    /*
      운영 환경에서는 GrapesJS Studio SDK 라이선스 키를 설정하세요.
      예:
      licenseKey: import.meta.env.VITE_GRAPESJS_LICENSE_KEY,
    */

    project: {
      type: 'web'
    },

    storage: {
      type: 'self',
      autosaveChanges: 10,
      autosaveIntervalMs: 10000,

      onLoad: async () => {
        return { project };
      },

      // 수정 내용을 곧바로 원본 sample/*.html에 반영한다.
      onSave: async ({ editor: cbEditor }) => {
        await exportHtml(cbEditor ?? editor);
        setStatus(`${currentFile} HTML 반영 완료`);
      }
    }
  });

  setStatus(`${file} 편집 준비 완료`);
}

async function exportCurrentHtml() {
  if (!editor || !currentFile) {
    return;
  }

  setStatus(`${currentFile} HTML export 중...`);
  await exportHtml(editor);
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
    await exportCurrentHtml();
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
