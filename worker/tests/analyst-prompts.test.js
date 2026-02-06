/**
 * Tests for analyst prompt template selection and formatting.
 */

import { describe, it, expect } from 'vitest';
import { getAnalystPrompt, getAvailableTemplates } from '../src/prompts/analyst.js';

describe('getAvailableTemplates', () => {
  it('returns all six template IDs', () => {
    const templates = getAvailableTemplates();
    expect(templates).toHaveLength(6);
    expect(templates).toContain('daily_review');
    expect(templates).toContain('single_trade');
    expect(templates).toContain('weekly_stats');
    expect(templates).toContain('strategy_eval');
    expect(templates).toContain('emotion_check');
    expect(templates).toContain('risk_assessment');
  });
});

describe('getAnalystPrompt', () => {
  it('returns null for invalid analysis type', () => {
    expect(getAnalystPrompt('nonexistent')).toBeNull();
    expect(getAnalystPrompt('')).toBeNull();
    expect(getAnalystPrompt(undefined)).toBeNull();
  });

  it('returns a string for valid analysis types', () => {
    for (const type of getAvailableTemplates()) {
      const prompt = getAnalystPrompt(type);
      expect(prompt).toBeTypeOf('string');
      expect(prompt.length).toBeGreaterThan(100);
    }
  });

  it('includes Chinese language instruction by default', () => {
    const prompt = getAnalystPrompt('daily_review');
    expect(prompt).toContain('用中文回复');
  });

  it('includes English language instruction when en is specified', () => {
    const prompt = getAnalystPrompt('daily_review', 'en');
    expect(prompt).toContain('Respond in English');
    expect(prompt).not.toContain('用中文回复');
  });

  it('includes the base system prompt in all templates', () => {
    for (const type of getAvailableTemplates()) {
      const prompt = getAnalystPrompt(type);
      expect(prompt).toContain('elite trading coach');
      expect(prompt).toContain('JSON');
    }
  });

  it('includes specific analysis type in daily_review', () => {
    const prompt = getAnalystPrompt('daily_review');
    expect(prompt).toContain('daily_review');
    expect(prompt).toContain('日内复盘');
  });

  it('includes specific analysis type in single_trade', () => {
    const prompt = getAnalystPrompt('single_trade');
    expect(prompt).toContain('single_trade');
    expect(prompt).toContain('单笔深挖');
  });

  it('includes specific analysis type in emotion_check', () => {
    const prompt = getAnalystPrompt('emotion_check');
    expect(prompt).toContain('emotion_check');
    expect(prompt).toContain('情绪体检');
  });

  it('keeps prompt within token budget (< 3000 chars as rough proxy)', () => {
    for (const type of getAvailableTemplates()) {
      const prompt = getAnalystPrompt(type);
      // ~4 chars per token, 3000 token budget = ~12000 chars max
      expect(prompt.length).toBeLessThan(12000);
    }
  });
});
