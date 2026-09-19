import Link from 'next/link'
import './landing.css'

/**
 * Shared body for the Mercatify marketing page. Rendered from two places:
 * `frontend/mercatify/page.tsx` (module-owned URL) and `src/app/start/page.tsx`
 * (this app's actual entry point — `/` redirects unauthenticated visitors here
 * unless `start_page_dismissed` is set). One source avoids the two drifting.
 */
export default function MercatifyLandingContent() {
  return (
    <div className="mercatify-landing">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-sans@5/index.css" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/geist-mono@5/index.css" />

      <nav className="nav">
        <div className="nav__inner">
          <a className="brand" href="#top"><span className="brand__mark">M</span>Mercatify</a>
          <div className="nav__links">
            <a href="#how">How it works</a>
            <a href="#report">What you get</a>
            <a href="#next">What happens next</a>
          </div>
          <a className="btn btn--primary" href="#start">Map my stack</a>
        </div>
      </nav>

      <main id="top">

        <section className="hero">
          <div className="wrap">
            <span className="eyebrow">Your SaaS stack is already your specification</span>
            <h1>Cut your SaaS bill by 80%. Keep everything those tools do.</h1>
            <p className="lede">
              Every SaaS subscription you pay for is a description of how your company works. We read that
              stack, work out what each tool is genuinely used for, and rebuild it as software you own.
              You see the coverage map, the savings and a working preview — before you commit a single sprint.
            </p>
            <div className="hero__cta">
              <a className="btn btn--primary" href="#start">Map my stack — free</a>
              <a className="btn btn--ghost" href="#report">See what you get</a>
            </div>
            <dl className="hero__meta">
              <div><dt>Typical saving</dt><dd>60–90% of SaaS licence spend</dd></div>
              <div><dt>Time to proposal</dt><dd>Hours, not weeks</dd></div>
              <div><dt>What you own</dt><dd>The code, the data, the roadmap</dd></div>
              <div><dt>Nothing lost</dt><dd>Every capability accounted for</dd></div>
            </dl>
          </div>
        </section>

        <section className="wrap" id="report">
          <span className="eyebrow">What lands in your inbox</span>
          <h2 className="section-h2 section-h2--20">One page your finance lead and your IT lead can both read</h2>
          <p className="lede lede--spaced">
            A line per tool: what it does for you today, what replaces it, how sure we are, and what it
            costs you every month. Written so you can argue with any single row.
          </p>

          <div className="panel panel--spaced">
            <div className="panel__bar">
              <span className="panel__dot" />
              <span className="panel__title">Example — an installation company, 34 people</span>
              <span className="panel__meta">7 tools · mapped in 11 minutes · checked by a person</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Tool in use</th>
                    <th>What it is actually used for</th>
                    <th>Open Mercato</th>
                    <th>Decision</th>
                    <th>Confidence</th>
                    <th className="num">Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="tool">HubSpot Sales<span className="sub">CRM</span></td>
                    <td>Contacts, deals, pipeline stages, email log</td>
                    <td>customers + sales</td>
                    <td><span className="chip chip--native">native</span></td>
                    <td><span className="conf conf--high"><span className="conf__bars"><i /><i /><i /></span>high</span></td>
                    <td className="num">$890</td>
                  </tr>
                  <tr>
                    <td className="tool">Airtable<span className="sub">Ad-hoc registers</span></td>
                    <td>Installer certifications, site surveys, permit tracking</td>
                    <td>Data designer — custom entities</td>
                    <td><span className="chip chip--native">native</span></td>
                    <td><span className="conf conf--high"><span className="conf__bars"><i /><i /><i /></span>high</span></td>
                    <td className="num">$240</td>
                  </tr>
                  <tr>
                    <td className="tool">Sortly<span className="sub">Inventory</span></td>
                    <td>Panels and inverters across two warehouses</td>
                    <td>wms — multi-warehouse stock</td>
                    <td><span className="chip chip--native">native</span></td>
                    <td><span className="conf conf--high"><span className="conf__bars"><i /><i /><i /></span>high</span></td>
                    <td className="num">$149</td>
                  </tr>
                  <tr>
                    <td className="tool">Jobber<span className="sub">Field service</span></td>
                    <td>Crew scheduling, job sheets, on-site checklists</td>
                    <td>planner + business rules</td>
                    <td><span className="chip chip--configure">configure</span></td>
                    <td><span className="conf conf--medium"><span className="conf__bars"><i /><i /><i /></span>medium</span></td>
                    <td className="num">$349</td>
                  </tr>
                  <tr>
                    <td className="tool">Zendesk<span className="sub">Support</span></td>
                    <td>Post-install tickets, warranty claims</td>
                    <td>messages + warranty_claims</td>
                    <td><span className="chip chip--configure">configure</span></td>
                    <td><span className="conf conf--medium"><span className="conf__bars"><i /><i /><i /></span>medium</span></td>
                    <td className="num">$415</td>
                  </tr>
                  <tr>
                    <td className="tool">PandaDoc<span className="sub">Quotes &amp; e-signature</span></td>
                    <td>Quote templates from panel configurations</td>
                    <td>quote builder — 40 h of work</td>
                    <td><span className="chip chip--build">build</span></td>
                    <td><span className="conf conf--medium"><span className="conf__bars"><i /><i /><i /></span>medium</span></td>
                    <td className="num">$199</td>
                  </tr>
                  <tr>
                    <td className="tool">PandaDoc<span className="sub">Legally binding signature</span></td>
                    <td>Customer signs the contract</td>
                    <td>stays external, wired in</td>
                    <td><span className="chip chip--integrate">integrate</span></td>
                    <td><span className="conf conf--high"><span className="conf__bars"><i /><i /><i /></span>high</span></td>
                    <td className="num">incl.</td>
                  </tr>
                  <tr>
                    <td className="tool">Xero<span className="sub">Accounting</span></td>
                    <td>Statutory books, VAT filing</td>
                    <td>not our business — keep it</td>
                    <td><span className="chip chip--keep">keep</span></td>
                    <td><span className="conf conf--high"><span className="conf__bars"><i /><i /><i /></span>high</span></td>
                    <td className="num">$78</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="panel__foot">
              <div>
                <span className="stat__k">Licences today</span>
                <span className="stat__v">$2,320<small>/mo</small></span>
                <span className="stat__note">7 tools, 34 seats</span>
              </div>
              <div>
                <span className="stat__k">After consolidation</span>
                <span className="stat__v">$277<small>/mo</small></span>
                <span className="stat__note">Xero + signature only</span>
              </div>
              <div>
                <span className="stat__k">Annual saving</span>
                <span className="stat__v">$24,516</span>
                <span className="stat__note">licences only, excludes hosting</span>
              </div>
              <div>
                <span className="stat__k">One-off build</span>
                <span className="stat__v">40<small> h</small></span>
                <span className="stat__note">quote builder · payback 2.4 mo</span>
              </div>
            </div>
          </div>
          <p className="disclaimer">Example figures. In your report every amount comes from your own invoices — we never estimate what you pay.</p>
        </section>

        <section className="wrap" id="how">
          <span className="eyebrow">How it works</span>
          <h2 className="section-h2 section-h2--18">Four steps, one of which is a human</h2>
          <div className="steps">
            <div className="step">
              <span className="step__n">01</span>
              <h3>Discover</h3>
              <p>A conversation, not a questionnaire. Which tools, what they cost, what hurts. Agents pull out what each tool is genuinely used for — not what its website claims.</p>
            </div>
            <div className="step">
              <span className="step__n">02</span>
              <h3>Map</h3>
              <p>Each of those jobs is matched against what the platform already does. We compare what your tools are for, not what they are called — two products with different names often do the same job.</p>
            </div>
            <div className="step">
              <span className="step__n">03</span>
              <h3>Decide</h3>
              <p>Native, configure, build, integrate or keep — one verdict per capability, each with evidence and a confidence band you can challenge.</p>
            </div>
            <div className="step">
              <span className="step__n">04</span>
              <h3>Preview</h3>
              <p>The thing that hurts most gets built as a working preview you can click. Then a person here reads the whole report before it reaches you — nothing is sent unread.</p>
            </div>
          </div>
        </section>

        <section className="band" id="start">
          <div className="band__inner">
            <div>
              <span className="eyebrow">Ready when you are</span>
              <h2>Map your stack in four minutes.</h2>
              <p>
                Type in the tools you pay for and roughly what they cost. That is the whole input —
                no call, no access to your systems, nothing installed. The map and the savings figure
                come back to you whether or not you go ahead with us.
              </p>
              <Link className="btn btn--primary" href="/login?redirect=%2Fbackend%2Fmercatify-intake">Start mapping</Link>
              <p className="band__note">Free. Your list stays yours — we never resell it or pass it on.</p>
            </div>
            <div className="band__art" role="img" aria-label="Your subscriptions arranged into a single coverage map" />
          </div>
        </section>

        <section className="wrap">
          <span className="eyebrow">How we work</span>
          <h2 className="section-h2 section-h2--20">We never propose replacing your stack</h2>
          <div className="quote">
            <p>We name the first piece worth cutting and what it saves. Then the next one. A rip-and-replace proposal is how these projects die in the board meeting — and how companies end up with two half-systems.</p>
            <cite>One subscription at a time, in the order that pays</cite>
          </div>
          <div className="split">
            <div className="col col--bad">
              <h3>Traditional presales</h3>
              <ul>
                <li>Two to six weeks from first call to proposal</li>
                <li>Discovery workshops billed by the day</li>
                <li>Coverage claims nobody can verify</li>
                <li>A slide deck as the deliverable</li>
                <li>Savings asserted, not computed</li>
                <li>The client sees software after the contract is signed</li>
              </ul>
            </div>
            <div className="col col--good">
              <h3>Mercatify</h3>
              <ul>
                <li>Hours from first call to reviewed proposal</li>
                <li>Discovery runs as part of the conversation</li>
                <li>Every verdict carries evidence and a confidence band</li>
                <li>A coverage map, a preview and a quote</li>
                <li>Savings computed from the client&apos;s own invoices</li>
                <li>The client clicks their future system before deciding</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="wrap" id="preview">
          <span className="eyebrow">The preview</span>
          <h2 className="section-h2 section-h2--20">You click your future system before you pay for it</h2>
          <p className="lede lede--spaced">
            Along with the report you get one of your own processes, running. Your product names,
            your job types, your steps — not a picture of a system, a system you can click through.
          </p>
          <ul className="rule-list">
            <li>
              <span className="n">01</span>
              <div>
                <h3>Your sorest process, end to end</h3>
                <p>Whatever you told us hurts most. Enquiry to quote to scheduled job, or goods in to stock to despatch — clicked through from start to finish.</p>
              </div>
            </li>
            <li>
              <span className="n">02</span>
              <div>
                <h3>It can only promise what the platform can do</h3>
                <p>The screens are built from the real thing, so nothing in the preview is a field that would quietly disappear during the build.</p>
              </div>
            </li>
            <li>
              <span className="n">03</span>
              <div>
                <h3>Anything still to be built says so</h3>
                <p>Parts marked <span className="chip chip--build">build</span> are labelled inside the preview itself. A prototype that hides its gaps is a sales trick, and it surfaces in week three anyway.</p>
              </div>
            </li>
          </ul>
        </section>

        <section className="wrap" id="next">
          <span className="eyebrow">What happens next</span>
          <h2 className="section-h2 section-h2--22">The questions everyone asks before saying yes</h2>
          <div className="cards">
            <div className="card">
              <span className="card__tag">After the report</span>
              <h3>You are not committed to anything</h3>
              <p>Most people take the map to their own team first. That is fine — it is written to be read without us in the room. If you want to go ahead, we start with the single piece that saves the most, not with the whole stack.</p>
            </div>
            <div className="card">
              <span className="card__tag">Who maintains it</span>
              <h3>You, us, or anyone you hire</h3>
              <p>What you end up with is an ordinary application on an open platform, not a private black box. We are the obvious people to keep it running, but nothing stops you moving it in-house or to another partner.</p>
            </div>
            <div className="card">
              <span className="card__tag">Your data</span>
              <h3>It stays yours, wherever you want it</h3>
              <p>Your own hosting or ours, your database, exportable in full at any point. Leaving is a copy, not a negotiation — which is exactly the thing your current subscriptions do not offer.</p>
            </div>
            <div className="card">
              <span className="card__tag">The tools you keep</span>
              <h3>We tell you what not to touch</h3>
              <p>Accounting, payroll, e-signature — some things are cheaper and safer rented. Those come back marked <span className="chip chip--keep">keep</span>, with the reason, and we never quote for replacing them.</p>
            </div>
            <div className="card">
              <span className="card__tag">Switching over</span>
              <h3>One piece at a time, nothing switched off early</h3>
              <p>Your old tool keeps running until the replacement is doing the work. The subscription is cancelled when you say so, not when we ship.</p>
            </div>
            <div className="card">
              <span className="card__tag">If your tool is unusual</span>
              <h3>We say when we don&apos;t know</h3>
              <p>Something niche or industry-specific comes back marked as unmapped rather than guessed at. The gaps in the map are part of what you are paying nothing for.</p>
            </div>
          </div>
        </section>

        <section className="cta-band wrap">
          <h2>Tell us what you pay for. We will tell you what you own.</h2>
          <p className="lede">
            Four minutes of typing, two working days, and a number you can take to your own board.
            You keep the map whether or not you go ahead with us.
          </p>
          <div className="hero__cta">
            <Link className="btn btn--primary" href="/login?redirect=%2Fbackend%2Fmercatify-intake">Map my stack — free</Link>
            <a className="btn btn--ghost" href="#report">See what you get</a>
          </div>
        </section>

      </main>

      <footer>
        <div className="wrap foot">
          <span>Mercatify — SaaS consolidation onto software you own</span>
          <span>Built on <a href="https://www.openmercato.com/">Open Mercato</a></span>
        </div>
      </footer>
    </div>
  )
}
