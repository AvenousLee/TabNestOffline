import { describe, expect, it } from 'vitest';
import { googleSignInOn } from './google';

describe('Google sign-in switch', () => {
  it('is off for new users, on for people who already added an account, and follows the setting once set', () => {
    expect(googleSignInOn(undefined, 0)).toBe(false);
    expect(googleSignInOn(undefined, 2)).toBe(true);
    expect(googleSignInOn(false, 2)).toBe(false);
    expect(googleSignInOn(true, 0)).toBe(true);
  });
});
