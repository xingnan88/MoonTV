import {
  buildDanmakuProviderUrl,
  buildDanmakuRequestUrl,
  DEFAULT_DANMAKU_DISPLAY_SETTINGS,
  getDanmakuDisplayAreaFromMargin,
  getDanmakuDisplayAreaOption,
  normalizeDanmakuDisplaySettings,
  parseDanmakuCandidates,
  parseDanmakuDisplaySettings,
  resolveDanmakuCommentUrl,
} from './danmaku';

describe('danmaku helpers', () => {
  test('builds a FongMi match URL from a provider root', () => {
    const url = buildDanmakuProviderUrl(
      'https://danmu.example.com',
      '葬送的芙莉莲',
      3,
      '2023'
    );

    expect(url.pathname).toBe('/api/v2/fongmi/danmaku');
    expect(url.searchParams.get('name')).toBe('葬送的芙莉莲 (2023)');
    expect(url.searchParams.get('episode')).toBe('3');
  });

  test('keeps a token prefix and accepts an existing API path', () => {
    const withToken = buildDanmakuProviderUrl(
      'https://danmu.example.com/87654321/',
      '三体',
      1
    );
    const withApiPath = buildDanmakuProviderUrl(
      'https://danmu.example.com/87654321/api/v2',
      '三体',
      1
    );

    expect(withToken.pathname).toBe('/87654321/api/v2/fongmi/danmaku');
    expect(withApiPath.pathname).toBe('/87654321/api/v2/fongmi/danmaku');
  });

  test('filters malformed match candidates', () => {
    expect(
      parseDanmakuCandidates([
        { name: '有效结果', url: '/api/v2/comment/1' },
        { name: '缺少地址' },
        null,
        'invalid',
      ])
    ).toEqual([{ name: '有效结果', url: '/api/v2/comment/1' }]);
  });

  test('resolves comment XML only within the configured provider', () => {
    const url = resolveDanmakuCommentUrl(
      'https://danmu.example.com/87654321',
      'https://danmu.example.com/87654321/api/v2/comment/123?format=json'
    );

    expect(url.pathname).toBe('/87654321/api/v2/comment/123');
    expect(url.searchParams.get('format')).toBe('xml');
    expect(() =>
      resolveDanmakuCommentUrl(
        'https://danmu.example.com/87654321',
        'https://attacker.example/api/v2/comment/123'
      )
    ).toThrow('来源不一致');
    expect(() =>
      resolveDanmakuCommentUrl(
        'https://danmu.example.com/87654321',
        'https://danmu.example.com/api/v2/comment/123'
      )
    ).toThrow('超出配置');
  });

  test('builds the same-origin player request URL', () => {
    expect(buildDanmakuRequestUrl('三体', 2, '2023')).toBe(
      '/api/danmaku?title=%E4%B8%89%E4%BD%93&episode=2&year=2023'
    );
  });

  test('parses and normalizes saved display settings', () => {
    expect(
      parseDanmakuDisplaySettings(
        JSON.stringify({ displayArea: 'half', fontSize: 32 })
      )
    ).toEqual({ displayArea: 'half', fontSize: 32 });
    expect(parseDanmakuDisplaySettings('{bad json')).toEqual(
      DEFAULT_DANMAKU_DISPLAY_SETTINGS
    );
    expect(
      normalizeDanmakuDisplaySettings({
        displayArea: 'unsupported',
        fontSize: 999,
      })
    ).toEqual({ displayArea: 'threeQuarter', fontSize: 120 });
  });

  test('maps display areas to plugin margins in both directions', () => {
    expect(getDanmakuDisplayAreaOption('quarter').margin).toEqual([10, '75%']);
    expect(getDanmakuDisplayAreaFromMargin([10, '50%'])).toBe('half');
    expect(getDanmakuDisplayAreaFromMargin(['20%', '20%'])).toBeNull();
  });
});
