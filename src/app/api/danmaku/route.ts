/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  buildDanmakuProviderUrl,
  EMPTY_DANMAKU_XML,
  parseDanmakuCandidates,
  resolveDanmakuCommentUrl,
} from '@/lib/danmaku';

export const runtime = 'edge';

const MATCH_TIMEOUT_MS = 8_000;
const COMMENT_TIMEOUT_MS = 15_000;

function createXmlResponse(
  xml: string,
  status: string,
  cacheControl = 'private, max-age=300'
) {
  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Danmaku-Status': status,
    },
  });
}

function createEmptyResponse(status: string) {
  return createXmlResponse(EMPTY_DANMAKU_XML, status, 'no-store');
}

async function fetchWithTimeout(
  input: URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCandidates(
  providerBaseUrl: string,
  title: string,
  episode: number,
  year?: string
) {
  const matchUrl = buildDanmakuProviderUrl(
    providerBaseUrl,
    title,
    episode,
    year
  );
  const response = await fetchWithTimeout(
    matchUrl,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
    MATCH_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`匹配接口返回 ${response.status}`);
  }

  return parseDanmakuCandidates(await response.json());
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.trim() || '';
  const year = request.nextUrl.searchParams.get('year')?.trim() || undefined;
  const episode = Number(request.nextUrl.searchParams.get('episode'));

  if (!title || !Number.isSafeInteger(episode) || episode < 1) {
    return createEmptyResponse('invalid-request');
  }

  try {
    const config = await getConfig();
    const providerBaseUrl = (
      process.env.DANMAKU_API_URL ||
      config.SiteConfig.DanmakuApi ||
      ''
    ).trim();

    if (!providerBaseUrl) {
      return createEmptyResponse('disabled');
    }

    let candidates = await fetchCandidates(
      providerBaseUrl,
      title,
      episode,
      year
    );
    if (candidates.length === 0 && year) {
      candidates = await fetchCandidates(providerBaseUrl, title, episode);
    }
    if (candidates.length === 0) {
      return createEmptyResponse('no-match');
    }

    const commentUrl = resolveDanmakuCommentUrl(
      providerBaseUrl,
      candidates[0].url
    );
    const commentResponse = await fetchWithTimeout(
      commentUrl,
      {
        cache: 'no-store',
        headers: { Accept: 'application/xml,text/xml' },
      },
      COMMENT_TIMEOUT_MS
    );

    if (!commentResponse.ok) {
      throw new Error(`弹幕接口返回 ${commentResponse.status}`);
    }

    const xml = await commentResponse.text();
    if (!xml.trimStart().startsWith('<')) {
      throw new Error('弹幕接口未返回 XML');
    }

    return createXmlResponse(xml, 'ok');
  } catch (error) {
    console.warn('加载弹幕失败:', error);
    return createEmptyResponse('upstream-error');
  }
}
