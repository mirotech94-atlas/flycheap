import { Fragment } from 'react';
import type { Rich } from './app.en';

/**
 * Renders a `Rich` segment list: even indexes as plain text, odd indexes
 * wrapped in <em>. Lets a headline like "Set it. Forget it. <em>Save big.</em>"
 * live in the dictionary as ['Set it. Forget it. ', 'Save big.', ''] so each
 * locale can move the emphasis wherever its grammar needs it.
 */
export function Em({ r }: { r: Rich }) {
  return (
    <>
      {r.map((s, i) => (i % 2 === 1 ? <em key={i}>{s}</em> : <Fragment key={i}>{s}</Fragment>))}
    </>
  );
}
