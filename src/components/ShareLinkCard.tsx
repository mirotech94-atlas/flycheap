/**
 * The old install-wide family link is retired: it showed every account's
 * watches to anyone holding it. Sharing now goes through per-group boards,
 * which show only their creator's watches and can expire and be revoked.
 */
export function ShareLinkCard() {
  return (
    <section className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">Family share</div>
          <h2 className="ed-panel-title">Share with a board</h2>
        </div>
      </div>
      <p className="ed-panel-note" style={{ marginBottom: 16 }}>
        The single read-only link has been retired, and links made with it no longer open.
        Boards replace it: each shows only your routes, can hide prices, expires, and can be
        revoked at any time. Boards live under an organisation; if your account is not part of
        one yet, contact us to set it up.
      </p>
    </section>
  );
}
