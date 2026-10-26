/** Fictional in-memory design sandbox. No app bootstrap, account or persistence owner. */
import { EditorSelection, EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  highlightSpecialChars,
  keymap,
  type DecorationSet,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  codeFolding,
  foldEffect,
  foldedRanges,
  indentUnit,
  unfoldAll,
  unfoldEffect,
} from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { livePreview } from '../../../src/editor/livePreview';
import { editorTheme } from '../../../src/editor/theme';
import {
  documentHeadings,
  headingPathFrom,
  type DocumentHeading,
} from '../../../src/editor/breadcrumbs';
import { renderStatic } from '../../../src/editor/staticRender';
import { textCommands } from '../../../src/editor/admittedCommands';
import '../../../src/styles/index.css';

const sample = [
  'Ask about the spare bike key. Also: that book Jo mentioned?',
  '',
  '# Work',
  '',
  'Keep Friday morning empty if possible. The calendar is not the plan.',
  '',
  '## Studio site',
  '',
  'A small thing we can finish. **No whole-site redesign.**',
  '',
  '### Launch',
  '',
  '- Ask Leila which photos we can use',
  '- Replace the “coming soon” page',
  '  - Use the short introduction from the pitch',
  '  - Link the two recent projects',
  '',
  '> Keep this tiny. A finished page beats another redesign.',
  '',
  '- Remove the old client logo from the footer',
  '- Check the invoice address too',
  '',
  'Leila prefers email after lunch. The image folder is called `site-final-actually-final`.',
  '',
  '### Later, maybe',
  '',
  '- A place for little process notes?',
  '- Ask whether anyone actually uses the PDF',
  '',
  'Not urgent. Could probably leave this alone for a month.',
  '',
  '## Admin',
  '',
  '- Send the expenses before Monday',
  '  - Receipt is in the backpack, probably',
  '- Cancel that trial before it renews',
  '',
  '**One boring email is enough progress.**',
  '',
  '# Home',
  '',
  'There are a few little things. They do not all need a project.',
  '',
  '## Kitchen',
  '',
  '- Sort the cabinet doors',
  '  - Measure door thickness before ordering hinges',
  '  - Send the photo to the carpenter',
  '- Compare the two heat-pump quotes',
  '',
  'The cheaper one didn’t include installation. Ask, don’t assume.',
  '',
  '## Later, maybe',
  '',
  '- Could the desk face the window?',
  '- The small lamp might work in the hall',
  '',
  '# People',
  '',
  '- Send Jo the photos from the walk',
  '- Ask whether Saturday still works',
  '  - Bring the book back',
  '',
  'Remember what Rosa said about giving things a little room.',
  '',
  '# Reading and scraps',
  '',
  'A title is not a promise to turn something into a project.',
  '',
  '- Look up the paper about spatial memory',
  '- A tiny website about very ordinary things?',
  '',
  '```text',
  'keep the weird unfinished note',
  '```',
  '',
  'Try leaving Friday morning empty.',
].join('\n');

type Idea = 'dim' | 'menus' | 'auto' | 'rail' | 'plain';
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw Error('Missing sketch element: ' + selector);
  return element;
};
const each = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
let idea: Idea = 'dim';
let headings: readonly DocumentHeading[] = [];
let readingPosition = 0;
let caretVisible = true;
let releaseOffscreen = true;
let autoDepth = 2;
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let measuring = false;
let autoApplying = false;
let menuCrumb: HTMLButtonElement | null = null;
const refresh = StateEffect.define<null>();
const maxEnd = (heading: DocumentHeading, state: EditorState) =>
  headings.find((h) => h.from > heading.from && h.level <= heading.level)?.from ?? state.doc.length;
const pathAt = (position: number) => headingPathFrom(headings, position);
const contains = (from: number, to: number, position: number) => from <= position && position < to;

function makeDecoration(state: EditorState): DecorationSet {
  if (idea !== 'dim' && idea !== 'rail') return Decoration.none;
  if (idea === 'dim' && releaseOffscreen && !caretVisible) return Decoration.none;
  const localHeadings = documentHeadings(state);
  const localEnd = (h: DocumentHeading) =>
    localHeadings.find((next) => next.from > h.from && next.level <= h.level)?.from ??
    state.doc.length;
  const path = headingPathFrom(
    localHeadings,
    idea === 'rail' ? readingPosition : state.selection.main.head,
  );
  const active = path.at(-1);
  if (!active) return Decoration.none;
  const end = localEnd(active);
  const parents = path.slice(-2);
  const parent = path.at(-2);
  const parentEnd = parent ? localEnd(parent) : 0;
  const marks = [];
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    const inBranch = contains(active.from, end, line.from);
    const selected = state.selection.ranges.some(
      (range) => !range.empty && line.from <= range.to && line.to >= range.from,
    );
    if (idea === 'dim') {
      const ancestor = parents.some((h) => h.from >= line.from && h.from <= line.to);
      if (!inBranch && !ancestor && !selected)
        marks.push(Decoration.line({ class: 'study-dim' }).range(line.from));
    } else {
      const parentBranch = !!parent && contains(parent.from, parentEnd, line.from);
      const classes = [inBranch ? 'study-rail' : '', parentBranch ? 'study-parent-rail' : '']
        .filter(Boolean)
        .join(' ');
      if (classes) marks.push(Decoration.line({ class: classes }).range(line.from));
    }
  }
  return Decoration.set(marks, true);
}

const contextDecoration = StateField.define<DecorationSet>({
  create: (state) => makeDecoration(state),
  update(value, transaction) {
    return transaction.docChanged ||
      transaction.selection ||
      transaction.effects.some((effect) => effect.is(refresh))
      ? makeDecoration(transaction.state)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const descriptions: Record<Idea, { title: string; description: string; tradeoff: string }> = {
  dim: {
    title: 'A · Gentle context',
    description:
      'The caret’s current section stays at ordinary contrast, together with its two nearest ancestor headings. Everything stays editable, in exactly the same place. Other writing becomes quieter.',
    tradeoff:
      'This changes color only. The important question is how it feels when you scroll away from the caret. The checked fallback restores normal contrast then; uncheck it to try strict caret-only focus.',
  },
  menus: {
    title: 'B · Breadcrumb menus',
    description:
      'Every breadcrumb has a navigation target and a child-section menu. Use a name to jump there, or its chevron to choose another section. The ordinary document stays visible.',
    tradeoff:
      'The path follows the place you are reading at the top of the viewport, as it does today. Navigation scrolls the editor without moving the caret or requesting the mobile keyboard.',
  },
  auto: {
    title: 'C · Scroll-open experiment',
    description:
      'Choose a heading level outside the app, then scroll. After scrolling settles, a section near the reading position can open. The caret and selected writing stay protected.',
    tradeoff:
      'Experimental: folding changes document height. This sandbox preserves a visible source anchor and avoids folding intersecting visible text, but jumping/chasing is still the central concern. There is no selected default heading level.',
  },
  rail: {
    title: 'D · Reading rail',
    description:
      'A thin margin mark follows the section you are reading, plus its parent. All writing keeps normal contrast and every line stays in place. It follows scrolling independently of the caret.',
    tradeoff:
      'This makes structure easier to feel without dimming or hiding writing. It provides less reduction in visual noise; the breadcrumb menus remain available for bigger jumps.',
  },
  plain: {
    title: 'The ordinary sheet',
    description:
      'Every line is shown at its normal contrast. The actual live-preview renderer still reveals Markdown on the caret line.',
    tradeoff:
      'Use the comparison buttons to layer an idea back onto this same editor. Your edits and selection are retained.',
  },
};

function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  setTimeout(() => ($('#toast').hidden = true), 4800);
}

function jump(position: number) {
  closeMenu();
  view.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'start', yMargin: 0 }) });
  scheduleMeasure();
}

function closeMenu(restore = false) {
  $('#breadcrumb-menu').hidden = true;
  if (menuCrumb) {
    menuCrumb.setAttribute('aria-expanded', 'false');
    if (restore) menuCrumb.focus({ preventScroll: true });
  }
  menuCrumb = null;
}

function childrenOf(parent: DocumentHeading | null) {
  return headings.filter((h) => {
    const path = pathAt(h.from);
    return parent ? path.at(-2)?.from === parent.from : path.length === 1;
  });
}

function openMenu(trigger: HTMLButtonElement, parent: DocumentHeading | null) {
  if (menuCrumb === trigger && !$('#breadcrumb-menu').hidden) {
    closeMenu();
    return;
  }
  closeMenu();
  menuCrumb = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  const menu = $('#breadcrumb-menu');
  menu.replaceChildren();
  let choices = childrenOf(parent);
  const caption = document.createElement('p');
  caption.className = 'menu-caption';
  if (parent && choices.length === 0) {
    choices = childrenOf(pathAt(parent.from).at(-2) ?? null);
    caption.textContent = 'Sibling sections · navigation only';
  } else
    caption.textContent =
      (parent ? 'Inside ' + parent.title : 'Top-level sections') + ' · navigation only';
  menu.append(caption);
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['headingFrom'] = String(choice.from);
    const name = document.createElement('span');
    name.className = 'menu-title';
    name.textContent = choice.title;
    const preview = document.createElement('span');
    preview.className = 'menu-preview';
    const content =
      view.state.doc
        .sliceString(view.state.doc.lineAt(choice.from).to, maxEnd(choice, view.state))
        .split('\n')
        .find((line) => line.trim() && !line.startsWith('#')) ?? '';
    preview.textContent =
      pathAt(choice.from)
        .map((h) => h.title)
        .join(' › ') +
      ' · ' +
      content.replace(/^\s*[-*>]\s*/, '').trim();
    button.append(name, preview);
    button.addEventListener('click', () => jump(choice.from));
    menu.append(button);
  }
  menu.hidden = false;
}

let renderedPath = '';
function renderBreadcrumbs() {
  const path = pathAt(readingPosition);
  const key = path.map((h) => h.from + ':' + h.title).join('|');
  if (key === renderedPath && $('#crumbs').childElementCount) return;
  renderedPath = key;
  closeMenu();
  const root = $('#crumbs');
  root.replaceChildren();
  function crumb(label: string, heading: DocumentHeading | null) {
    const wrapper = document.createElement('span');
    wrapper.className = 'crumb-piece';
    const name = document.createElement('button');
    name.className = 'crumb-label';
    name.textContent = label;
    name.type = 'button';
    name.addEventListener('click', () => jump(heading?.from ?? 0));
    const arrow = document.createElement('button');
    arrow.className = 'crumb-arrow';
    arrow.textContent = '›';
    arrow.type = 'button';
    arrow.setAttribute('aria-label', 'Sections inside ' + label);
    arrow.setAttribute('aria-expanded', 'false');
    arrow.addEventListener('click', () => openMenu(arrow, heading));
    wrapper.append(name, arrow);
    root.append(wrapper);
  }
  crumb('Goals', null);
  for (const heading of path) crumb(heading.title, heading);
}

function scheduleMeasure() {
  if (measuring) return;
  measuring = true;
  requestAnimationFrame(() => {
    measuring = false;
    const rect = view.scrollDOM.getBoundingClientRect();
    const topHeight = Math.max(0, rect.top - view.documentTop + 2);
    readingPosition = view.lineBlockAtHeight(topHeight).from;
    const caret = view.coordsAtPos(view.state.selection.main.head);
    caretVisible = !!caret && caret.bottom >= rect.top && caret.top <= rect.bottom;
    renderBreadcrumbs();
    view.dispatch({ effects: refresh.of(null) });
    const caretPath =
      pathAt(view.state.selection.main.head)
        .map((h) => h.title)
        .join(' › ') || 'Unheaded notes';
    const readPath =
      pathAt(readingPosition)
        .map((h) => h.title)
        .join(' › ') || 'Unheaded notes';
    $('#editor-status').textContent =
      'Reading: ' +
      readPath +
      '. Caret: ' +
      caretPath +
      (caretVisible ? ' (in view).' : ' (off-screen).');
  });
}

function foldOnScroll() {
  if (idea !== 'auto' || autoApplying || view.composing || view.compositionStarted) return;
  const chapters = headings.filter((h) => h.level === autoDepth);
  if (chapters.length < 2) return;
  const rect = view.scrollDOM.getBoundingClientRect();
  const centerHeight = Math.max(0, rect.top - view.documentTop + Math.min(90, rect.height * 0.2));
  const center = view.lineBlockAtHeight(centerHeight).from;
  const reading = chapters.find((h) => contains(h.from, maxEnd(h, view.state), center));
  const selected = view.state.selection.ranges;
  const protectedChapters = new Set(
    chapters
      .filter((h) => selected.some((r) => r.from < maxEnd(h, view.state) && r.to >= h.from))
      .map((h) => h.from),
  );
  if (reading) protectedChapters.add(reading.from);
  const visibleFrom = view.lineBlockAtHeight(Math.max(0, rect.top - view.documentTop)).from;
  const visibleTo = view.lineBlockAtHeight(Math.max(0, rect.bottom - view.documentTop)).to;
  const folded = new Map<number, number>();
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    folded.set(from, to);
  });
  const effects = [];
  for (const chapter of chapters) {
    const from = view.state.doc.lineAt(chapter.from).to;
    const to = Math.max(from, maxEnd(chapter, view.state) - 1);
    if (to <= from + 1) continue;
    const intersects = chapter.from <= visibleTo && maxEnd(chapter, view.state) >= visibleFrom;
    const keepOpen = protectedChapters.has(chapter.from) || (intersects && !folded.has(from));
    if (keepOpen && folded.has(from)) effects.push(unfoldEffect.of({ from, to }));
    if (!keepOpen && !folded.has(from)) effects.push(foldEffect.of({ from, to }));
  }
  if (!effects.length) return;
  const anchor = view.lineBlockAtHeight(Math.max(0, rect.top - view.documentTop)).from;
  const before = view.coordsAtPos(anchor)?.top;
  autoApplying = true;
  view.dispatch({ effects });
  requestAnimationFrame(() => {
    const after = view.coordsAtPos(anchor)?.top;
    if (before !== undefined && after !== undefined) view.scrollDOM.scrollTop += after - before;
    autoApplying = false;
    scheduleMeasure();
  });
}

const initial = sample.indexOf('- Replace');
const view = new EditorView({
  parent: $('#editor'),
  state: EditorState.create({
    doc: sample,
    selection: EditorSelection.cursor(initial),
    extensions: [
      markdown({ base: markdownLanguage, addKeymap: false }),
      indentUnit.of('  '),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      highlightSpecialChars(),
      history(),
      keymap.of([
        { key: 'Mod-Enter', run: () => true },
        { key: 'Tab', run: textCommands.indent, preventDefault: true },
        { key: 'Shift-Tab', run: textCommands.outdent, preventDefault: true },
        { key: 'Mod-b', run: textCommands.bold },
        { key: 'Mod-i', run: textCommands.italic },
        { key: 'Mod-[', run: textCommands.outdent },
        { key: 'Mod-]', run: textCommands.indent },
        { key: 'Alt-Backspace', run: textCommands.deleteWordBackward },
        { key: 'Enter', run: textCommands.enter },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      livePreview(),
      editorTheme,
      contextDecoration,
      codeFolding({ placeholderText: '… section folded' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) headings = documentHeadings(update.state);
        if (update.docChanged || update.selectionSet || update.viewportChanged) scheduleMeasure();
        if (update.selectionSet && idea === 'auto') {
          clearTimeout(autoTimer);
          autoTimer = setTimeout(foldOnScroll, 220);
        }
      }),
    ],
  }),
});
headings = documentHeadings(view.state);
view.dispatch({ effects: refresh.of(null) });

view.scrollDOM.addEventListener(
  'scroll',
  () => {
    scheduleMeasure();
    if (idea === 'auto' && !autoApplying) {
      clearTimeout(autoTimer);
      autoTimer = setTimeout(foldOnScroll, 220);
    }
  },
  { passive: true },
);

function selectIdea(next: Idea) {
  clearTimeout(autoTimer);
  idea = next;
  unfoldAll(view);
  each('[data-idea]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset['idea'] === idea)),
  );
  const text = descriptions[idea];
  $('#idea-title').textContent = text.title;
  $('#idea-description').textContent = text.description;
  $('#idea-tradeoff').textContent = text.tradeoff;
  $('#auto-controls').hidden = idea !== 'auto';
  $('#offscreen-control').hidden = idea !== 'dim';
  $('#rail-legend').hidden = idea !== 'rail';
  view.dispatch({ effects: refresh.of(null) });
  scheduleMeasure();
  if (idea === 'auto') autoTimer = setTimeout(foldOnScroll, 260);
}
each('[data-idea]').forEach((button) =>
  button.addEventListener('click', () => selectIdea(button.dataset['idea'] as Idea)),
);
$('#offscreen-release').addEventListener('change', () => {
  releaseOffscreen = $<HTMLInputElement>('#offscreen-release').checked;
  scheduleMeasure();
});
$('#fold-depth').addEventListener('change', () => {
  autoDepth = Number($<HTMLSelectElement>('#fold-depth').value);
  unfoldAll(view);
  autoTimer = setTimeout(foldOnScroll, 220);
});
const placeCaret = (needle: string) => {
  unfoldAll(view);
  const position = view.state.doc.toString().indexOf(needle);
  if (position < 0) {
    toast('That sample line has been edited. Click anywhere in the document instead.');
    return;
  }
  view.dispatch({
    selection: EditorSelection.cursor(position),
    effects: EditorView.scrollIntoView(position, { y: 'center' }),
  });
  view.focus();
  scheduleMeasure();
};
$('#caret-launch').addEventListener('click', () => placeCaret('Replace the “coming soon” page'));
$('#caret-kitchen').addEventListener('click', () => placeCaret('Measure door thickness'));
$('#scroll-away').addEventListener('click', () => {
  const end = headings.find((h) => h.title === 'People')?.from ?? view.state.doc.length;
  jump(end);
});
$('#show-all').addEventListener('click', () => selectIdea('plain'));

const menu = $('#breadcrumb-menu');
document.addEventListener('pointerdown', (event) => {
  if (
    event.target instanceof Node &&
    !menu.contains(event.target) &&
    !$('#crumbs').contains(event.target)
  )
    closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    event.preventDefault();
    closeMenu(true);
  }
  if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
});

each('[data-footer]').forEach((button) =>
  button.addEventListener('click', () => {
    const line = view.state.doc.lineAt(view.state.selection.main.head).text.trim();
    toast(
      'Footer retained. A real ' +
        $<HTMLInputElement>('input[name=demo-transfer-mode]:checked').value +
        ' to ' +
        button.dataset['footer'] +
        ' would act on: ' +
        line,
    );
  }),
);

function card(host: HTMLElement, text: string, path: string, section: 'next' | 'scheduled') {
  const article = document.createElement('article');
  article.className = 'card';
  const surface = document.createElement('div');
  surface.className = 'card-surface md-render';
  surface.tabIndex = 0;
  renderStatic(surface, text);
  const context = document.createElement('div');
  context.className = 'inherited-context';
  context.textContent = '↳ ' + path;
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'card-action card-reorder-handle';
  grip.setAttribute('aria-label', 'Reorder sample card');
  grip.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4.5 3h.01M9.5 3h.01M4.5 7h.01M9.5 7h.01M4.5 11h.01M9.5 11h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>';
  actions.append(grip);
  for (const label of section === 'next'
    ? ['Done', 'Later', 'Duplicate', 'Remove']
    : ['Done', 'Next', 'Tomorrow', 'Duplicate', 'Remove']) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'card-action';
    action.textContent = label;
    action.addEventListener('click', () =>
      toast('Existing card action shown for styling reference; no app command runs.'),
    );
    actions.append(action);
  }
  article.append(surface, context, actions);
  host.append(article);
}
card(
  $('#baseline-cards'),
  'Replace the “coming soon” page\n- Use the short introduction from the pitch\n- Link the two recent projects',
  'Work › Studio site › Launch',
  'next',
);
card(
  $('#scheduled-cards'),
  'Measure the cabinet doors\nCheck the thickness before ordering hinges.',
  'Home › Kitchen',
  'scheduled',
);
$('#show-context').addEventListener('change', () =>
  each('.inherited-context').forEach(
    (row) => (row.hidden = !$<HTMLInputElement>('#show-context').checked),
  ),
);

function renderReturn() {
  const kind = $<HTMLSelectElement>('#return-case').value;
  const preview = $('#return-preview');
  preview.replaceChildren();
  const add = (text: string) => preview.append(document.createTextNode(text));
  const insert = () => {
    const span = document.createElement('span');
    span.className = 'return-match';
    span.textContent =
      '- Replace the “coming soon” page\n  - Use the short introduction from the pitch\n  - Link the two recent projects\n';
    preview.append(span);
  };
  if (kind === 'full') {
    $('#return-label').textContent = 'Full match · Work › Studio site › Launch';
    $('#return-explanation').textContent =
      'Append to Launch’s own text before its next subheading or sibling. An older copy may already exist; this return does not deduplicate it.';
    add('# Work\n\n## Studio site\n\n### Launch\n\n- Ask Leila about the photos\n\n');
    insert();
    add('\n### Later, maybe\n\n- A place for process notes?');
  } else if (kind === 'partial') {
    $('#return-label').textContent = 'Closest match · Work › Studio site';
    $('#return-explanation').textContent =
      'Launch is missing. Proposed insertion is at the end of Studio site’s own text, before its first child heading. Whether to retain the missing Launch label in Markdown remains a choice.';
    add('# Work\n\n## Studio site\n\nA small thing we can finish.\n\n');
    insert();
    add('\n### Later, maybe\n\n- A place for process notes?');
  } else if (kind === 'duplicate') {
    $('#return-label').textContent = 'Two full matches · choose a section';
    $('#return-explanation').textContent =
      'Both branches have the same complete path. Do not choose the first or last automatically. Show nearby authored text or a location preview to distinguish them.';
    add(
      '# Work\n## Studio site\n### Launch\nOlder launch notes…\n\n# Work\n## Studio site\n### Launch\nCurrent pitch notes…\n\n[Choose a destination before moving]',
    );
  } else {
    $('#return-label').textContent = 'No root-path match · ask where';
    $('#return-explanation').textContent =
      'Home › Launch is not Work › Studio site › Launch. Offer a location or the unheaded start of Goals, not an automatic append inside the final unrelated section.';
    add(
      '[Choose a destination or the unheaded start of Goals]\n\n# Home\n\n## Launch\n\nNotes about the boat.\n\n[Do not silently append the website card here]',
    );
  }
}
$('#return-case').addEventListener('change', renderReturn);
renderReturn();
function setTab(tab: string) {
  for (const name of ['editor', 'cards', 'return']) $('#' + name + '-tab').hidden = name !== tab;
  each('[data-tab]').forEach((link) =>
    link.setAttribute('aria-current', link.dataset['tab'] === tab ? 'page' : 'false'),
  );
  if (tab === 'editor') scheduleMeasure();
}
each('[data-tab]').forEach((link) =>
  link.addEventListener('click', () => setTab(link.dataset['tab']!)),
);
const initialTab = location.hash.slice(1);
setTab(['editor', 'cards', 'return'].includes(initialTab) ? initialTab : 'editor');
function theme() {
  const light = document.body.classList.toggle('light');
  each('[data-theme],#theme-toggle').forEach(
    (button) => (button.textContent = light ? 'Dark preview' : 'Light preview'),
  );
}
$('#theme-toggle').addEventListener('click', theme);
each('[data-theme]').forEach((button) => button.addEventListener('click', theme));
$('#loading').hidden = true;
selectIdea('dim');
setTimeout(() => {
  view.dispatch({ effects: EditorView.scrollIntoView(initial, { y: 'center' }) });
  scheduleMeasure();
}, 50);
(window as unknown as { designStudy: unknown }).designStudy = {
  view,
  selectIdea,
  sample,
  pathAt,
  get idea() {
    return idea;
  },
  get headings() {
    return headings;
  },
};
