/*
  screen-design.html 류 SPA 지원 모듈.

  이 파일들은 화면 내용을 정적 DOM이 아니라 <script> 안의
  `const SCREENS = [{ ..., body: `<html>` }, ...]` 데이터로 들고 있어
  GrapesJS가 직접 편집할 수 없다.

  전략:
  - 로드 시   : SCREENS 각 항목의 body(HTML 조각)를 꺼내 GrapesJS '페이지'로 펼친다.
  - 저장 시   : 편집된 각 페이지 HTML을 원래 SCREENS[i].body 템플릿 리터럴 자리에
                다시 끼워 넣는다. 렌더링 엔진/네비게이션/기타 필드는 그대로 보존된다.
*/

export function isScreensFile(html) {
  return /const\s+SCREENS\s*=/.test(html);
}

// 첫 번째 <style> 블록 내용(디자인 시스템 CSS)을 추출한다. 없으면 ''.
export function extractStyleCss(html) {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}

/*
  `const SCREENS = [ ... ]` 배열 리터럴의 정확한 경계를 찾아 원문을 반환한다.
  문자열/템플릿 리터럴 안의 대괄호는 무시하므로 body HTML에 [, ]가 있어도 안전하다.
*/
function extractScreensLiteral(html) {
  const marker = html.match(/const\s+SCREENS\s*=\s*/);
  if (!marker) return null;

  let i = marker.index + marker[0].length;
  if (html[i] !== '[') return null;

  const start = i;
  let depth = 0;
  let str = null; // 현재 열린 따옴표 종류 (' " `) 또는 null
  let esc = false;

  for (; i < html.length; i++) {
    const c = html[i];

    if (str) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === str) {
        str = null;
      }
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      str = c;
      continue;
    }

    if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }

  return null;
}

/*
  SCREENS 배열을 실제 JS 값으로 materialize 한다.
  리터럴은 순수 데이터 + 정적 템플릿 문자열뿐이라 외부 참조가 없다.
*/
export function extractScreens(html) {
  const literal = extractScreensLiteral(html);
  if (!literal) {
    throw new Error('SCREENS 배열을 찾지 못했습니다.');
  }

  // eslint-disable-next-line no-new-func
  const screens = new Function(`return (${literal});`)();

  if (!Array.isArray(screens)) {
    throw new Error('SCREENS가 배열이 아닙니다.');
  }

  return screens;
}

function escapeForTemplate(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/*
  편집된 body HTML들을 원래 파일의 `body: `...`` 자리에 순서대로 다시 끼워 넣는다.
  orderedHtmls[i]는 SCREENS 배열의 i번째 화면에 대응한다.
*/
export function reinjectBodies(html, orderedHtmls) {
  let idx = 0;

  const re = /body:\s*`[\s\S]*?`/g;
  const out = html.replace(re, (match) => {
    if (idx >= orderedHtmls.length) return match;
    const content = escapeForTemplate(orderedHtmls[idx]);
    idx++;
    return `body: \`\n${content}\n    \``;
  });

  if (idx !== orderedHtmls.length) {
    throw new Error(
      `body 템플릿 개수 불일치: 파일에서 ${idx}개 발견, 편집 결과 ${orderedHtmls.length}개`
    );
  }

  return out;
}
