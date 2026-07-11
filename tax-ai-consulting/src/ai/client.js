/**
 * Claude API 클라이언트 래퍼
 *
 * 기본은 공식 @anthropic-ai/sdk 클라이언트를 생성한다 (ANTHROPIC_API_KEY 환경변수 사용).
 * 테스트나 다른 환경에서는 { messages: { create } } 형태의 객체를 주입해 대체할 수 있다.
 */

import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-4-8';

export function createClient(options = {}) {
  return new Anthropic(options);
}

/** 응답 content 배열에서 텍스트 블록만 이어붙여 반환 */
export function extractText(response) {
  return (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * messages.create 호출 + 서버 도구(웹검색) 사용 시 발생하는 pause_turn 재개 처리.
 * stop_reason이 refusal이면 오류를 던진다.
 */
export async function createMessageWithResume(client, request, { maxContinuations = 5 } = {}) {
  let messages = request.messages;
  let response = await client.messages.create({ ...request, messages });

  let continuations = 0;
  while (response.stop_reason === 'pause_turn') {
    if (++continuations > maxContinuations) {
      throw new Error(`AI 호출이 ${maxContinuations}회 재개 후에도 완료되지 않았습니다 (pause_turn).`);
    }
    messages = [...messages, { role: 'assistant', content: response.content }];
    response = await client.messages.create({ ...request, messages });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('AI가 요청 처리를 거부했습니다 (stop_reason: refusal).');
  }

  return response;
}
