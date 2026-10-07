/**
 * Cloudflare Pages Function — Anthropic Claude API 프록시
 *
 * 경로: /api/chat (Pages 배포 시 자동 노출, 같은 origin)
 * 같은 origin이므로 CORS·화이트리스트 불필요.
 *
 * 환경변수 설정 (Pages 프로젝트 → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY  (Encrypt 체크 → Secret으로 저장)
 *
 * 배포:
 *   wrangler pages deploy public  (또는 GitHub 연동으로 자동 배포)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// 기본 모델. 환경변수 MODEL_ID 로 재배포 없이 교체 가능
// (비용 절감이 필요하면 'claude-sonnet-5-5' 로 변경)
const DEFAULT_MODEL_ID = 'claude-opus-5-5';

export const onRequestPost = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(500, 'Server misconfigured: ANTHROPIC_API_KEY missing');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const { messages, system, max_tokens = 4096 } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError(400, 'messages array is required');
  }
  if (typeof max_tokens !== 'number' || max_tokens < 1 || max_tokens > 16000) {
    return jsonError(400, 'max_tokens must be 1..16000');
  }

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type':      'application/json',
      'x-api-key':         env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: env.MODEL_ID || DEFAULT_MODEL_ID,
      max_tokens,
      stream: true,
      ...(system ? { system } : {}),
      messages,
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return jsonError(upstream.status, `Anthropic API error: ${errText}`);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type':  'text/event-stream',
      'cache-control': 'no-cache',
      'connection':    'keep-alive',
    },
  });
};

// 기타 메서드는 405
export const onRequest = ({ request }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  return jsonError(405, 'Method Not Allowed');
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
