/* Handbook Guide: the GOJ Handbook of Public Sector Procurement Procedures,
   Volume 1 (General Provisions, March 2014) as a quick reference, with an
   approval-route calculator driven by Settings → Signatories & limits. */
(function () {
  'use strict';
  const { util, ui, store, domain } = Proc;
  const esc = util.esc;

  const SECTIONS = [
    {
      id: 'thresholds', ref: '§2.4', title: 'Approval thresholds',
      html: () => {
        const L = store.settings().limits, S = store.settings().signatories;
        return '<table class="table compact"><thead><tr><th>Contract value (gross)</th><th>Authority</th></tr></thead><tbody>' +
          '<tr><td class="nowrap">J$15 million and below</td><td>The Head of the Procuring Entity approves, subject to the Handbook procedures.</td></tr>' +
          '<tr><td class="nowrap">Above J$15M up to J$40M</td><td>The Head of the Procuring Entity approves on the endorsement of the recommendation by the NCC.</td></tr>' +
          '<tr><td class="nowrap">Above J$40 million</td><td>Cabinet approves, following approval by the Head of the Procuring Entity / Accounting Officer and endorsement of the NCC.</td></tr></tbody></table>' +
          '<p class="mt-2">Thresholds relate to the <b>gross value of the contract</b> and are revised from time to time by Cabinet.</p>' +
          '<div class="alert mt-2">' + ui.icon('info') + '<div><div class="t">How this system applies it at ' + esc(store.settings().org.hospital) + '</div>' +
          'Committee review from ' + util.money(L.committeeMin, { noCents: true }) + ' · ' + esc(S.parishManager.title) + ' delegated authority ' + util.money(L.delegated, { noCents: true }) +
          ' · NCC/PPC endorsement above ' + util.money(L.ncc, { noCents: true }) + ' · Cabinet above ' + util.money(L.cabinet, { noCents: true }) + '. Change these in <a href="#/settings/approvals">Settings</a>.</div></div>';
      }
    },
    {
      id: 'committee', ref: '§2.2.5', title: 'Procurement Committee',
      html: () => '<ul class="g-list">' +
        '<li>Every Procuring Entity shall establish a Procurement Committee of <b>not less than five (5) persons</b>, including senior Financial Management personnel and four (4) other appropriately qualified Public Officers.</li>' +
        '<li>A member who is requesting procurement approval <b>shall not vote</b> on that approval. Committee members who sat on the Evaluation Committee do not vote when the Committee considers that evaluation.</li>' +
        '<li>Members should be trained in GOJ procurement procedures before serving. Technical personnel are co-opted as needed.</li>' +
        '<li><b>Internal Audit</b> personnel must not sit on the Committee. The Chairman of the Board and the Head of the Procuring Entity shall not sit on it. Board members may not exceed 40% of the membership.</li>' +
        '<li>The Committee reviews all procurement requiring the final approval of the Head of Entity; <b>the lower limit of this threshold should be no greater than $1.5M</b>.</li>' +
        '<li>Mandate (§2.2.5.1): review award recommendations; ensure compliance with policies and procedures; review Evaluation Committee reports; facilitate responses to contractor inquiries; keep proper records and minutes, including recommended awards; ensure reporting obligations are met; make recommendations to the Head of the Procuring Entity.</li>' +
        '<li>Meetings need a pre-determined quorum and minutes. In urgency a <b>round-robin</b> may be carried out.</li></ul>'
    },
    {
      id: 'evaluation', ref: '§2.2.6', title: 'Evaluation Committees',
      html: () => '<p>Evaluation Committees compare the bids received and prepare the <b>Bid Evaluation Report</b>. During evaluation they must:</p><ol class="g-list">' +
        '<li>keep the bid evaluation process strictly confidential;</li><li>reject any attempt or pressure to distort the outcome;</li><li>reject any proposed action likely to lead to fraud and corruption; and</li>' +
        '<li>apply <b>only</b> the evaluation and qualification criteria specified in the bidding documents.</li></ol>' +
        '<p class="mt-2">In this system: record each bidder\'s compliance in the price comparison — non-compliant bids are excluded from the automatic lowest-price award, and the evaluation note is printed on the memo.</p>'
    },
    {
      id: 'officers', ref: '§2.2.7–2.3', title: 'Accounting Officers & the Procurement Unit',
      html: () => '<ul class="g-list"><li>Accounting Officers are accountable to the Minister of Finance for the propriety of procurement expenditure. Strict compliance with the Handbook is enforced unless the Ministry of Finance gives prior written permission.</li>' +
        '<li><b>The approval of the Accounting Officer is mandatory for all contract award recommendations to the NCC.</b></li>' +
        '<li>Accountable Officers must keep safeguards in place so the requirements are adhered to at all times.</li>' +
        '<li>Each entity shall have a specialist Procurement Unit; all procurement is channelled through it, and functionaries submit their specifications to the Unit to complete the process.</li></ul>'
    },
    {
      id: 'reporting', ref: '§1.2', title: 'Reporting awards',
      html: () => '<ul class="g-list"><li><b>Notwithstanding any internal approval, the Ministry of Finance, the OCG and the NCC must be duly advised of all contract awards.</b> The monthly PRS return to the Ministry of Finance is produced from <a href="#/reports">Reports &amp; PRS</a>.</li>' +
        '<li>Business-sensitive procurement approved by the Head of Entity through Direct Contracting must be reported to the Ministry of Finance (PRS), the OCG (QCA report) and the NCC <b>within thirty days</b> (§1.2.2).</li></ul>'
    },
    {
      id: 'g2g', ref: '§1.2.3', title: 'Buying from another Government entity',
      html: () => '<ul class="g-list"><li>Government entities may contract each other by <b>Direct Contracting</b>, provided the rates are competitive and offer value for money; otherwise revert to a competitive process.</li>' +
        '<li>TRN, Tax Compliance Certificate and NCC registration requirements <b>do not apply</b>. Awards are still approved under the §2.4 thresholds.</li><li>Government entities shall not participate in public tender processes.</li></ul>'
    },
    {
      id: 'exclusions', ref: '§1.2.1', title: 'Exclusions from the Handbook',
      html: () => '<p>Not subject to these procedures (other guidelines or industry practice apply):</p><ul class="g-list cols">' +
        ['Acquisition or rental of land, existing buildings or other immovable property', 'Works of art; artistic and cultural performances and related services', 'Contracts of employment', 'Legal services (except Central Government entities served by the Attorney General\'s Dept.)',
          '<b>Services of medical professionals / facilities</b>', 'National Honours Awards: medallions, insignias', 'Sensitive procurement for national defence / security', 'Services related to pension funds', 'Fiscal agency, depository, public debt services',
          'Items on the International Commodities Market', 'Selection of a media house for advertising', 'Motor vehicles for assignment to officers (Motor Vehicle Policy applies)', 'Air travel, hotel accommodation for conferences and training',
          'Procurement under GOJ bilateral and other agreements', 'Group Health and Life Insurance', 'Co-sponsorships, trade and travel road shows, co-operative advertising'].map(x => '<li>' + x + '</li>').join('') + '</ul>'
    },
    {
      id: 'complaints', ref: '§2.5', title: 'Complaints and appeals',
      html: () => '<div class="timeline">' +
        [['Complaint to the Procuring Entity', 'Within <b>20 days</b> of the contractor becoming aware of the circumstances.'],
          ['Written decision by the Head of Entity', 'Within <b>14 days</b> of receipt, giving reasons and stating that any appeal goes to the NCC within 14 days.'],
          ['Appeal to the NCC', 'Within <b>14 days</b> of the contractor receiving the decision (copied to the Head of Entity). The NCC recommends a resolution within 14 days.'],
          ['Procurement Appeals Board', 'Within <b>14 days</b> of receiving the NCC\'s decision; the Board recommends within 14 days.'],
          ['Judicial review', 'If the administrative review gives no adequate redress.']].map(s => '<div class="tl-item"><div class="strong">' + s[0] + '</div><div>' + s[1] + '</div></div>').join('') + '</div>' +
        '<ul class="g-list mt-2"><li>Not reviewable: the <b>choice of procurement method</b> and a decision to <b>reject all</b> tenders, proposals or quotations.</li><li>Complaints and appeals <b>do not automatically stop</b> the award process.</li><li>Keep copies of all complaints, appeals, decisions and recommendations in the procurement record — upload them to the supplier\'s documents.</li></ul>'
    },
    {
      id: 'confidentiality', ref: '§3', title: 'Confidentiality',
      html: () => '<ul class="g-list"><li>The tender process is confidential; evaluation information must not be divulged.</li><li>Leaking a bidder\'s proprietary or strategic information is unethical and illegal and results in sanctions.</li>' +
        '<li>Procurement files are kept up to date and confidential; access is restricted to those authorised by the Head of the Procuring Entity.</li></ul>'
    },
    {
      id: 'conflict', ref: '§4', title: 'Conflict of interest & ethics',
      html: () => '<ul class="g-list"><li>Anyone involved in procurement who has, or is about to have, a financial or business relationship that might be a conflict <b>must inform their supervisor in writing immediately</b>.</li>' +
        '<li>Declare any relationship (by blood or marriage) with a bidder, contractor or consultant and take <b>no part</b> in the decision or the contract. After disclosing in a meeting, leave while it is deliberated.</li>' +
        '<li>Do not accept <b>gifts</b> from current or potential contractors, and avoid hospitality that could be seen as influencing a decision.</li>' +
        '<li>Prohibited: revealing inside information to bidders; discussing a procurement outside the official process; favouring a bidder in specifications or evaluation; altering or hiding procurement documents; discussing future employment with a bidder; ignoring violations.</li>' +
        '<li>Report unethical conduct to superiors, oversight agencies, the Contractor General or the auditors.</li></ul>'
    },
    {
      id: 'fraud', ref: '§5', title: 'Fraud and corruption',
      html: () => '<dl class="kv"><dt>Corrupt practice</dt><dd>Offering, giving, receiving or soliciting anything of value to influence a Public Officer.</dd><dt>Fraudulent practice</dt><dd>Misrepresenting facts to influence a procurement or the execution of a contract.</dd>' +
        '<dt>Collusive practice</dt><dd>Arrangements between bidders to set prices at artificial, non-competitive levels.</dd><dt>Coercive practice</dt><dd>Harming or threatening to harm persons or property to influence participation.</dd>' +
        '<dt>Obstructive practice</dt><dd>Destroying, falsifying or concealing evidence, or intimidating witnesses, to impede an investigation.</dd></dl>' +
        '<p class="mt-2">Bids are rejected where the recommended bidder engaged in such practices, and the firm may be declared ineligible. Staff who prepare estimates or manage the process must not help contractors prepare bids. Mark such suppliers <b>Debarred</b> on their supplier page.</p>'
    },
    {
      id: 'file', ref: 'Checklist', title: 'What to keep on every procurement file',
      html: () => '<ol class="g-list">' + ['Requisition and specifications from the requesting department', 'Invitation / RFQ (GOJEP notice) and the list of suppliers invited', 'All quotations or bids received (upload to each supplier\'s documents)',
        'Price comparison / Bid Evaluation Report', 'Procurement Committee minutes or round-robin record', 'Approval memo(s) — committee and, above the delegated limit, Head of Entity — with the signed decision',
        'Purchase order (signed copy)', 'Delivery note / Goods Received Note', 'Supplier invoice and payment record', 'Any complaint, appeal or conflict-of-interest declaration'].map(x => '<li>' + x + '</li>').join('') + '</ol>' +
        '<p class="small muted mt-2">Practical checklist drawn from the Handbook\'s record-keeping requirements (§2.2.5.1(e), §2.5, §3).</p>'
    }
  ];

  const CSS = '.g-list{padding-left:20px;display:grid;gap:7px}.g-list.cols{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}@media(max-width:760px){.g-list.cols{grid-template-columns:1fr}}' +
    '.g-toc a{display:flex;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:8px;color:var(--text-2);font-size:13.5px}.g-toc a:hover{background:var(--surface-3);text-decoration:none;color:var(--text)}.g-toc .r{color:var(--text-3);font-size:12px}' +
    '.g-sec{scroll-margin-top:80px}.g-sec .card-b p{line-height:1.6}mark{background:var(--warning-bg);color:inherit;border-radius:3px}';

  Proc.page({
    id: 'guide', title: 'Handbook Guide', icon: 'shield', section: 'Insights', order: 30,
    render(el) {
      if (!document.getElementById('css-guide')) document.head.insertAdjacentHTML('beforeend', '<style id="css-guide">' + CSS + '</style>');
      el.innerHTML = ui.pageHead({ title: 'Handbook Guide', sub: 'GOJ Handbook of Public Sector Procurement Procedures — Volume 1, General Provisions (Ministry of Finance, March 2014).' }) +
        '<div class="grid side-l"><div class="stack">' +
        '<div class="card"><div class="card-h"><h3>Approval route calculator</h3></div><div class="card-b"><div class="field"><label>Award value (JMD)</label><div class="input-group"><span class="prefix">$</span><input type="number" step="0.01" id="gCalc" value="2534577"></div></div><div class="words mt-1" id="gWords"></div><div class="mt-2" id="gRoute"></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>Contents</h3></div><div class="card-b g-toc" style="padding:8px">' + SECTIONS.map(s => '<a href="javascript:void 0" data-go="' + s.id + '"><span>' + esc(s.title) + '</span><span class="r">' + esc(s.ref) + '</span></a>').join('') + '</div></div></div>' +
        '<div><div class="card mb-2"><div class="toolbar" style="border:0"><div class="search" style="max-width:none">' + ui.icon('search', 'sm') + '<input type="search" id="gSearch" placeholder="Search the guide — e.g. gifts, appeal, committee, exclusions"></div></div></div>' +
        '<div class="alert warning mb-2">' + ui.icon('alert') + '<div>This summary follows the 2014 Handbook supplied by the Procurement Unit. Public procurement is now also governed by the Public Procurement Act and Regulations, under which the Public Procurement Commission (PPC) took over the NCC\'s role; confirm current thresholds against the latest Ministry of Finance circulars.</div></div>' +
        '<div id="gBody">' + SECTIONS.map(s => '<div class="card g-sec" id="g-' + s.id + '"><div class="card-h"><h3>' + esc(s.title) + '</h3><span class="chip">' + esc(s.ref) + '</span></div><div class="card-b">' + s.html() + '</div></div>').join('') + '</div></div></div>';
      const calc = el.querySelector('#gCalc');
      const upd = () => { const v = util.num(calc.value); el.querySelector('#gWords').textContent = v ? domain.amountWords(v) : ''; el.querySelector('#gRoute').innerHTML = ui.routeHtml(domain.approvalRoute(v, [{ amount: v }])); };
      calc.addEventListener('input', upd); upd();
      el.querySelectorAll('[data-go]').forEach(a => a.onclick = () => { const t = el.querySelector('#g-' + a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      const body = el.querySelector('#gBody');
      el.querySelector('#gSearch').addEventListener('input', util.debounce(e => {
        const q = e.target.value.trim().toLowerCase();
        body.querySelectorAll('mark').forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
        body.querySelectorAll('.g-sec').forEach(sec => {
          const hit = !q || sec.textContent.toLowerCase().indexOf(q) >= 0;
          sec.hidden = !hit;
          if (hit && q.length > 2) {
            const walker = document.createTreeWalker(sec.querySelector('.card-b'), NodeFilter.SHOW_TEXT);
            const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(n => { const i = n.nodeValue.toLowerCase().indexOf(q); if (i < 0) return; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); const m = document.createElement('mark'); r.surroundContents(m); });
          }
        });
      }, 150));
    }
  });
})();
