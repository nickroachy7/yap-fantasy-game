import { Redirect } from 'expo-router';

/** /collection has no page of its own; Inventory is the landing sub-page. */
export default function CollectionIndex() {
  return <Redirect href="/fantasy/collection/inventory" />;
}
