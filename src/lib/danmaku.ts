export interface DanmakuCandidate {
  name: string;
  url: string;
}

export type DanmakuDisplayArea = 'quarter' | 'half' | 'threeQuarter' | 'full';

export type DanmakuMargin = [number | `${number}%`, number | `${number}%`];

export interface DanmakuDisplaySettings {
  displayArea: DanmakuDisplayArea;
  fontSize: number;
}

export const DANMAKU_DISPLAY_AREA_OPTIONS: ReadonlyArray<{
  value: DanmakuDisplayArea;
  label: string;
  margin: DanmakuMargin;
}> = [
  { value: 'quarter', label: '上方 1/4', margin: [10, '75%'] },
  { value: 'half', label: '上方半屏', margin: [10, '50%'] },
  { value: 'threeQuarter', label: '上方 3/4', margin: [10, '25%'] },
  { value: 'full', label: '全屏', margin: [10, 10] },
];

export const DANMAKU_FONT_SIZE_OPTIONS = [18, 25, 32, 40] as const;

export const DEFAULT_DANMAKU_DISPLAY_SETTINGS: DanmakuDisplaySettings = {
  displayArea: 'threeQuarter',
  fontSize: 25,
};

const MIN_DANMAKU_FONT_SIZE = 12;
const MAX_DANMAKU_FONT_SIZE = 120;

function isDanmakuDisplayArea(value: unknown): value is DanmakuDisplayArea {
  return DANMAKU_DISPLAY_AREA_OPTIONS.some((option) => option.value === value);
}

export function normalizeDanmakuDisplaySettings(
  value: unknown
): DanmakuDisplaySettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DANMAKU_DISPLAY_SETTINGS };
  }

  const settings = value as Record<string, unknown>;
  const displayArea = isDanmakuDisplayArea(settings.displayArea)
    ? settings.displayArea
    : DEFAULT_DANMAKU_DISPLAY_SETTINGS.displayArea;
  const fontSize =
    typeof settings.fontSize === 'number' && Number.isFinite(settings.fontSize)
      ? Math.min(
          MAX_DANMAKU_FONT_SIZE,
          Math.max(MIN_DANMAKU_FONT_SIZE, Math.round(settings.fontSize))
        )
      : DEFAULT_DANMAKU_DISPLAY_SETTINGS.fontSize;

  return { displayArea, fontSize };
}

export function parseDanmakuDisplaySettings(
  serialized: string | null
): DanmakuDisplaySettings {
  if (!serialized) return { ...DEFAULT_DANMAKU_DISPLAY_SETTINGS };

  try {
    return normalizeDanmakuDisplaySettings(JSON.parse(serialized));
  } catch {
    return { ...DEFAULT_DANMAKU_DISPLAY_SETTINGS };
  }
}

export function getDanmakuDisplayAreaOption(displayArea: DanmakuDisplayArea) {
  return (
    DANMAKU_DISPLAY_AREA_OPTIONS.find(
      (option) => option.value === displayArea
    ) || DANMAKU_DISPLAY_AREA_OPTIONS[2]
  );
}

export function getDanmakuDisplayAreaFromMargin(
  margin: unknown
): DanmakuDisplayArea | null {
  if (!Array.isArray(margin) || margin.length !== 2) return null;

  return (
    DANMAKU_DISPLAY_AREA_OPTIONS.find(
      (option) =>
        option.margin[0] === margin[0] && option.margin[1] === margin[1]
    )?.value || null
  );
}

export const EMPTY_DANMAKU_XML =
  '<?xml version="1.0" encoding="UTF-8"?><i></i>';

const DANMAKU_API_PATH = '/api/v2/fongmi/danmaku';

function normalizeProviderPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  if (path.endsWith(DANMAKU_API_PATH)) return path;
  if (path.endsWith('/api/v2')) return `${path}/fongmi/danmaku`;
  return `${path}${DANMAKU_API_PATH}`;
}

export function buildDanmakuProviderUrl(
  providerBaseUrl: string,
  title: string,
  episode: number,
  year?: string
): URL {
  const url = new URL(providerBaseUrl.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('弹幕 API 仅支持 HTTP 或 HTTPS 地址');
  }

  url.pathname = normalizeProviderPath(url.pathname);
  url.search = '';
  url.hash = '';

  const normalizedYear = year?.trim();
  const name =
    normalizedYear && !title.includes(normalizedYear)
      ? `${title} (${normalizedYear})`
      : title;
  url.searchParams.set('name', name);
  url.searchParams.set('episode', String(episode));
  return url;
}

export function parseDanmakuCandidates(payload: unknown): DanmakuCandidate[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { name, url } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !url.trim()) return [];

    return [
      {
        name: typeof name === 'string' ? name : '',
        url: url.trim(),
      },
    ];
  });
}

function getProviderPrefix(pathname: string): string {
  const apiIndex = pathname.indexOf('/api/v2');
  if (apiIndex >= 0) return pathname.slice(0, apiIndex);
  return pathname.replace(/\/+$/, '');
}

export function resolveDanmakuCommentUrl(
  providerBaseUrl: string,
  candidateUrl: string
): URL {
  const provider = new URL(providerBaseUrl.trim());
  const comment = new URL(candidateUrl, provider);

  if (comment.protocol !== 'http:' && comment.protocol !== 'https:') {
    throw new Error('弹幕地址协议不受支持');
  }
  if (comment.origin !== provider.origin) {
    throw new Error('弹幕地址与配置的 API 来源不一致');
  }

  const providerPrefix = getProviderPrefix(provider.pathname);
  if (
    providerPrefix &&
    providerPrefix !== '/' &&
    comment.pathname !== providerPrefix &&
    !comment.pathname.startsWith(`${providerPrefix}/`)
  ) {
    throw new Error('弹幕地址超出配置的 API 路径');
  }

  comment.searchParams.set('format', 'xml');
  return comment;
}

export function buildDanmakuRequestUrl(
  title: string,
  episode: number,
  year?: string
): string {
  const params = new URLSearchParams({
    title,
    episode: String(episode),
  });
  if (year?.trim()) params.set('year', year.trim());
  return `/api/danmaku?${params.toString()}`;
}
