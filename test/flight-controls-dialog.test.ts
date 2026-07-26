import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlightControlsDialog } from '../src/ui/hud/FlightControlsDialog';
import {
  ACTION_LABELS,
  flightPrefs,
  resetFlightPrefs,
  saveFlightPrefs,
} from '../src/ui/scene/flightBindings';

function renderDialog(): string {
  return renderToStaticMarkup(createElement(FlightControlsDialog, { onClose: () => undefined }));
}

function rowBinding(markup: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markup.match(
    new RegExp(`<span class="fc-label">${escaped}</span><button[^>]*>([^<]*)</button>`),
  );
  if (!match) throw new Error(`Missing control row for ${label}`);
  return match[1] ?? '';
}

describe('FlightControlsDialog binding-derived copy', () => {
  beforeEach(() => resetFlightPrefs());
  afterEach(() => resetFlightPrefs());

  it('shows separate active keyboard and standard-pad copy for Jump and Exit', () => {
    const markup = renderDialog();

    expect(rowBinding(markup, ACTION_LABELS.engage)).toBe('e');
    expect(rowBinding(markup, ACTION_LABELS.jump)).toBe('j');
    expect(rowBinding(markup, ACTION_LABELS.exit)).toBe('escape');
    expect(markup).toContain('left bumper');
    expect(markup).toContain('view / back');
  });

  it('renders remapped keys instead of stale defaults', () => {
    const current = flightPrefs();
    saveFlightPrefs({
      ...current,
      bindings: {
        ...current.bindings,
        jump: ['Digit7'],
        exit: ['KeyQ'],
      },
    });

    const markup = renderDialog();
    expect(rowBinding(markup, ACTION_LABELS.jump)).toBe('7');
    expect(rowBinding(markup, ACTION_LABELS.exit)).toBe('q');
    expect(markup).toContain('<kbd>q</kbd>');
  });
});
