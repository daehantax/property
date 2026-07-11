/**
 * .env 파일 로더
 *
 * 프로젝트 루트(tax-ai-consulting/)의 .env 파일을 읽어 process.env에 넣는다.
 * 이미 셸에서 설정된 환경변수가 우선이며, .env 값으로 덮어쓰지 않는다.
 * 파일이 없으면 조용히 넘어가므로 CI·테스트 환경에서도 안전하다.
 *
 * 외부 패키지(dotenv) 없이 동작하도록 KEY=VALUE 형식만 지원한다.
 * 값을 감싼 따옴표('...' / "...")와 앞의 export 키워드는 허용한다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadEnv(envPath = path.join(projectRoot, '.env')) {
  let text;
  try {
    text = fs.readFileSync(envPath, 'utf-8');
  } catch {
    return; // .env 없음 — 셸 환경변수만 사용
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();
