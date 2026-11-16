import { describe, expect, it } from 'vitest';
import { appConfigUrl, browserLabel, cleanConfig, fillLink } from './appConfig';

describe('app config (changeable without a rebuild)', () => {
  it('is read from the repository main branch', () => {
    expect(appConfigUrl('https://github.com/AvenousLee/TabNestOffline')).toBe('https://raw.githubusercontent.com/AvenousLee/TabNestOffline/main/app-config.json');
  });

  it('keeps only an https feedback link', () => {
    expect(cleanConfig({ feedbackUrl: ' https://forms.gle/abc ', other: 1 })).toEqual({ feedbackUrl: 'https://forms.gle/abc' });
    expect(cleanConfig({ feedbackUrl: 'javascript:alert(1)' })).toEqual({ feedbackUrl: undefined });
    expect(cleanConfig({ feedbackUrl: '' })).toEqual({ feedbackUrl: undefined });
    expect(cleanConfig(null)).toEqual({ feedbackUrl: undefined });
  });

  it('fills {version} and {browser} into a pre-filled form link', () => {
    const url = 'https://docs.google.com/forms/d/e/X/viewform?usp=pp_url&entry.1={version}&entry.2={browser}&x={other}';
    expect(fillLink(url, { version: '0.2.0', browser: 'Chrome 142 (Windows)' })).toBe(
      'https://docs.google.com/forms/d/e/X/viewform?usp=pp_url&entry.1=0.2.0&entry.2=Chrome%20142%20(Windows)&x={other}',
    );
  });

  it('names the browser', () => {
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')).toBe('Chrome 142 (Windows)');
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0')).toBe('Edge 142 (Windows)');
  });
});
