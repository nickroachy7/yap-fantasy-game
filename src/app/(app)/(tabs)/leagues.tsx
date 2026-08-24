/**
 * Private leagues — the second product, and for now a promise rather than one.
 *
 * IT SHIPS EMPTY ON PURPOSE. The bottom bar is the one place the app states
 * what it is, and a bar reading Yap · Scores · Profile says "this is a card
 * game" and nothing else. The tab beside Yap is what makes Yap mean something:
 * our game over here, your league over there. That opposition is doing the work
 * the word "Yap" cannot do alone — see the note on the tab in `sections.ts` —
 * so the tab has to exist before the feature does, or the name it is holding up
 * has no partner.
 *
 * The honest cost is a tab that cannot be used, and the page pays it by saying
 * so in the first line rather than by dressing an empty list up as a loading
 * state. No spinner, no skeleton, no "Create a league" button that opens
 * nothing: a control that does not work is worse than an absent one, because
 * pressing it is how the reader finds out.
 *
 * WHAT REPLACES THIS. A league is not a fantasy board with a filter on it — it
 * has membership, invites, a draft, a schedule and a commissioner, none of
 * which exist in the schema today. When they do, this file becomes a list of
 * the leagues you are in and the tab grows sections the way Yap has them.
 * Nothing else in the navigation has to change: `NAV_TABS` already carries the
 * route, the rail already draws the row, and a tab that grows `sections` is a
 * nested navigator by the rule the tabs layout already follows.
 *
 * `measure="form"` rather than the default grid: this page is one short block
 * of prose, and prose set across the full width of a browser window is the
 * thing `ContentMeasure` exists to prevent.
 */
import { Screen } from '@/components/shell/Screen';
import { EmptyState } from '@/components/ui/EmptyState';

export default function LeaguesScreen() {
  return (
    <Screen title="Leagues" measure="form" context="Coming soon">
      <EmptyState
        title="Private leagues coming soon"
        body="Draft with your group, play your own schedule, and settle it between you. Your cards and your collection stay in Yap — this is the other half."
      />
    </Screen>
  );
}
