// Small drawings of where to click on a provider's site.
//
// Drawn, not screenshotted: a screenshot goes stale the day the provider
// restyles a button, while "Security on the left, API tokens along the top"
// survives it. Only the words a reader has to find are written; they are the
// provider's own labels, and everything else is a grey bar.

export function HetznerTokenSketch() {
  return (
    <figure
      className="hv-ob-sketch"
      aria-label="In your Hetzner project: Security at the bottom of the left menu, then API tokens along the top, then Generate API token. Choose Read & Write."
    >
      <div className="hv-ob-sketch-window">
        <div className="hv-ob-sketch-side">
          <i />
          <i />
          <i />
          <i />
          <b>Security</b>
        </div>
        <div className="hv-ob-sketch-main">
          <div className="hv-ob-sketch-tabs">
            <span>SSH keys</span>
            <b>API tokens</b>
            <span>Certificates</span>
          </div>
          <div className="hv-ob-sketch-action">
            <b>Generate API token</b>
          </div>
          <div className="hv-ob-sketch-dialog">
            <span>
              Description <em>Hallvi</em>
            </span>
            <span>
              Permissions <s>Read</s> <b>Read &amp; Write</b>
            </span>
          </div>
        </div>
      </div>
      <figcaption>
        A drawing of the Hetzner Console, not a screenshot. The highlighted
        words are Hetzner&rsquo;s own labels.
      </figcaption>
    </figure>
  );
}

export function CloudflareTokenSketch({ zone }: { zone: string }) {
  return (
    <figure
      className="hv-ob-sketch"
      aria-label={`On Cloudflare's Create Token page: under Zone Resources choose Include, Specific zone, ${zone}. Then Continue to summary, then Create Token.`}
    >
      <div className="hv-ob-sketch-window" data-plain="">
        <div className="hv-ob-sketch-main">
          <div className="hv-ob-sketch-dialog">
            <span>
              Permissions <em>Zone · DNS · Edit</em> <em>Zone · Zone · Read</em>
            </span>
            <span>
              Zone Resources <em>Include</em> <b>Specific zone</b> <b>{zone}</b>
            </span>
          </div>
          <div className="hv-ob-sketch-action">
            <b>Continue to summary</b>
            <span>then</span>
            <b>Create Token</b>
          </div>
        </div>
      </div>
      <figcaption>
        Hallvi&rsquo;s link fills in the permissions. You pick the zone:
        Cloudflare does not let a link choose it for you.
      </figcaption>
    </figure>
  );
}
