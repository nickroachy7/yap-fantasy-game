/**
 * What the chrome ABOVE a page has already drawn.
 *
 * `Screen` is rendered by every page and would happily draw the masthead itself
 * — that is what it did before there were any frames. Now there are two of
 * them, nested: `FantasyFrame` draws the masthead and the top nav above the
 * whole Fantasy navigator, and `SectionFrame` draws the sub-page bar above one
 * section's navigator. A page inside Collection sits under both.
 *
 * So the frames announce what they took care of, and `Screen` renders the rest.
 * A context rather than a prop because the pages must not have to be told which
 * frames they happen to be inside: a page moved into or out of a section keeps
 * working either way, and neither frame has to reach down through a navigator
 * it does not own to pass anything.
 *
 * TWO FLAGS, NOT ONE, and they are not the same question:
 *
 *   header — the masthead is already on screen, so do not draw a second one.
 *   nav    — a navigation bar sits immediately above this page and OWNS the
 *            gap between the chrome and the content, so the page's own top
 *            padding must go. A page with `header` but no `nav` — the lineup,
 *            which has no sub-pages and so no action bar — keeps its padding,
 *            because the top nav above it supplies no gap of its own.
 *
 * The single boolean this replaced conflated them, which was invisible for as
 * long as every framed page also had a section nav.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type FrameState = {
  /** A frame above has drawn `AppHeader`. */
  header: boolean;
  /** A frame above has drawn a nav bar directly on top of this page. */
  nav: boolean;
};

const NONE: FrameState = { header: false, nav: false };

const FrameContext = createContext<FrameState>(NONE);

/** What the chrome above this component has already drawn. */
export function useFrame(): FrameState {
  return useContext(FrameContext);
}

/**
 * Adds to what the frames above have drawn rather than replacing it.
 *
 * Merging is the point: `SectionFrame` knows it drew a nav and knows nothing
 * about whether a masthead exists — that is `FantasyFrame`'s business, one
 * navigator up — and a provider that replaced the value would tell every page
 * in Collection there was no header and get two.
 */
export function FrameProvider({
  value,
  children,
}: {
  value: Partial<FrameState>;
  children: ReactNode;
}) {
  const outer = useFrame();
  /* Memoised on the four booleans rather than on `value`, which is a fresh
     object literal on every render of every frame — without this the whole
     subtree re-renders each time a frame does, which on the lineup is once a
     second while the lock counts down. */
  const header = value.header ?? outer.header;
  const nav = value.nav ?? outer.nav;
  const merged = useMemo<FrameState>(() => ({ header, nav }), [header, nav]);
  return <FrameContext.Provider value={merged}>{children}</FrameContext.Provider>;
}
