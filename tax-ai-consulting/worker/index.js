/**
 * Cloudflare Worker — Anthropic Claude API 프록시
 *
 * 기능:
 *   - POST /api/chat : Claude messages.create 스트리밍 패스스루
 *   - API 키는 Worker 환경변수(ANTHROPIC_API_KEY)에 보관
 *   - CORS 허용 (개발 단계: *, 운영 시 도메인 화이트리스트 권장)
 *
 * 배포:
 *   wrangler deploy
 *   wrangler secret put ANTHROPIC_API_KEY   ← 비밀키 등록
 *
 * 클라이언트 호출:
 *   fetch('https://<worker-subdomain>.workers.dev/api/chat', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ messages, system, max_tokens })
 *   })
 *   응답: text/event-stream (SSE 그대로 패스스루)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// 기본 모델. 환경변수 MODEL_ID 로 재배포 없이 교체 가능
// (비용 절감이 필요하면 'claude-sonnet-5-5' 로 변경)
const DEFAULT_MODEL_ID = 'claude-opus-5-5';

// 운영 시 본인 도메인으로 제한 권장 (예: 'https://tax-ai.tuzaga.kr')
const CORS_ALLOW_ORIGIN = '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  CORS_ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/chat' || request.method !== 'POST') {
      return jsonError(404, 'Not Found');
    }

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
        model:      env.MODEL_ID || DEFAULT_MODEL_ID,
        max_tokens,
        stream:     true,
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
        ...CORS_HEADERS,
        'content-type':  'text/event-stream',
        'cache-control': 'no-cache',
        'connection':    'keep-alive',
      },
    });
  },
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
    },
  });
}
