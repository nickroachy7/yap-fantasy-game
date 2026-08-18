import { Redirect } from 'expo-router';

/** /cards has no page of its own; Players is the landing sub-page. */
export default function CardsIndex() {
  return <Redirect href="/cards/players" />;
}
