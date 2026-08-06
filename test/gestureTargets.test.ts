import { describe, expect, it } from 'vitest';
import { startsTextInteraction } from '../src/gestures/useGestures';

describe('long-press targets', () => {
  it('reserves a hold for editable text and its descendants', () => {
    const content = document.createElement('div');
    content.setAttribute('contenteditable', 'true');
    const line = document.createElement('div');
    content.append(line);

    expect(startsTextInteraction(line)).toBe(true);
  });

  it('lets a held non-text surface remain eligible for navigation', () => {
    expect(startsTextInteraction(document.createElement('header'))).toBe(false);
  });

  it('reserves the matching hold that unlocks a guarded Done card', () => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset['guarded'] = 'true';
    const surface = document.createElement('div');
    card.append(surface);

    expect(startsTextInteraction(surface)).toBe(true);
  });
});
