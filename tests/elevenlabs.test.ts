import { describe, it, expect } from 'vitest';
import { speakable, isConfigured, conciergeVoiceId } from '../src/lib/elevenlabs';

describe('elevenlabs', () => {
  it('is not configured without a key, and never throws on that path', () => {
    const prev = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    expect(isConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = '   ';
    expect(isConfigured()).toBe(false);
    if (prev !== undefined) process.env.ELEVENLABS_API_KEY = prev; else delete process.env.ELEVENLABS_API_KEY;
  });

  it('uses the default voice unless overridden', () => {
    const prev = process.env.ELEVENLABS_VOICE_ID;
    delete process.env.ELEVENLABS_VOICE_ID;
    expect(conciergeVoiceId()).toBe('EXAVITQu4vr4xnSDxMaL');
    process.env.ELEVENLABS_VOICE_ID = 'abc123';
    expect(conciergeVoiceId()).toBe('abc123');
    if (prev !== undefined) process.env.ELEVENLABS_VOICE_ID = prev; else delete process.env.ELEVENLABS_VOICE_ID;
  });

  it('reads a route and a price the way a person says them', () => {
    expect(speakable('JFK → CAI is $536 on Sep 24')).toBe('J F K to C A I is 536 dollars on Sep 24');
    expect(speakable('$1,023 normal → now $900')).toBe('1023 dollars normal to now 900 dollars');
  });

  it('spells bare airport codes but leaves ordinary capitalised words alone', () => {
    expect(speakable('Cheapest from LAX in MAY')).toBe('Cheapest from L A X in MAY');
    expect(speakable('THE fare is NEW')).toBe('THE fare is NEW');
  });

  it('leaves text with nothing to convert untouched', () => {
    expect(speakable('Your alerts are on.')).toBe('Your alerts are on.');
  });
});
