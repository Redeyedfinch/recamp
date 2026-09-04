/**
 * Seed — the workspace RECAMP opens for the first time.
 *
 * PROVENANCE RULES (these are enforced by tests/seed.test.mjs):
 *   provenance: 'sourced'  → the fact comes from the project brief's public
 *                             description of RECAMP. Nothing else qualifies.
 *   provenance: 'demo'     → placeholder content that makes the workspace
 *                             legible. Labelled DEMO everywhere it appears.
 *   provenance: null       → operational content (tasks, guides, templates)
 *                             that asserts nothing about the organisation.
 *
 *   dateConfidence: 'exact' | 'year' | 'unavailable'
 *   A 'sourced' record never carries a date more precise than the brief gave.
 *
 * No member names, counts, sponsors, awards or testimonials are invented.
 */
import { DATABASES } from './schema.js';
import { initialKeys } from '../core/order.js';

export const SEED_VERSION = 3;
const T0 = '2026-09-01T09:00:00.000Z';   // seed timestamp; edits after this win merges

const nodes = {}; const blocks = {};
let blockSeq = 0;

function addNode(id, n) {
  nodes[id] = { id, cover: null, props: {}, createdAt: T0, updatedAt: T0, archived: false, provenance: null, ...n };
  return nodes[id];
}

/** Add a linear list of blocks to a node. Items: [type, text, props?] or nested {type,text,children}. */
function addBlocks(nodeId, items, parentId = nodeId) {
  const keys = initialKeys(items.length);
  items.forEach((it, i) => {
    const [type, text = '', props = {}] = Array.isArray(it) ? it : [it.type, it.text, it.props || {}];
    const id = `b_${nodeId.replace(/^[a-z]+_/, '')}_${String(++blockSeq).padStart(3, '0')}`;
    blocks[id] = { id, nodeId, parentId, type, text, props, order: keys[i], createdAt: T0, updatedAt: T0, archived: false };
    if (!Array.isArray(it) && it.children) addBlocks(nodeId, it.children, id);
  });
}

const P = t => ['paragraph', t];
const H2 = t => ['h2', t];
const H3 = t => ['h3', t];
const B = t => ['bullet', t];
const CALL = (t, tone = 'celestial') => ['callout', t, { tone }];
const TODO = (t, done = false) => ['todo', t, { done }];

export function buildSeed() {
  Object.keys(nodes).forEach(k => delete nodes[k]); Object.keys(blocks).forEach(k => delete blocks[k]); blockSeq = 0;
  const rootKeys = initialKeys(12); let rk = 0;

  /* ------------------------------------------------------------ About */
  addNode('p_about', { kind: 'page', parentId: 'root', title: 'About RECAMP', icon: 'orbit', order: rootKeys[rk++], provenance: 'sourced' });
  addBlocks('p_about', [
    P('RECAMP is the official forum of the Physical Sciences Department at Jain (Deemed-to-be University), School of Sciences, Bengaluru.'),
    P('It is a common platform for students who are curious about the physical sciences, regardless of their department.'),
    H2('What the forum does'),
    B('Scientific events'), B('Extracurricular activities'), B('Debates'), B('Projects'), B('Interactive sessions'),
    B('Guest lectures'), B('Student engagement'), B('Competitions'), B('Scientific communication'), B('Space-related discussions'),
    H2('Find RECAMP'),
    P('Instagram — <a href="https://www.instagram.com/recamp_jgi" target="_blank" rel="noopener">@recamp_jgi</a>'),
    H2('How this archive treats facts'),
    CALL('Every record in this workspace carries a provenance mark. <b>SOURCED</b> means the fact comes from RECAMP\'s public description. <b>DEMO</b> means it is placeholder content, kept only until the committee replaces it. Where a date is not known, the record says <i>Date unavailable</i> rather than guessing.'),
  ]);

  /* --------------------------------------------------------- Databases */
  for (const [id, def] of Object.entries(DATABASES)) {
    addNode(id, { kind: 'database', parentId: 'root', title: def.title, icon: def.icon, order: rootKeys[rk++], description: def.description, catalogue: def.catalogue, schema: JSON.parse(JSON.stringify(def.schema)), views: JSON.parse(JSON.stringify(def.views)), nextSeq: 1 });
  }
  const seq = {}; const rec = (dbId, id, n) => {
    const db = nodes[dbId]; seq[dbId] = (seq[dbId] || 0) + 1; db.nextSeq = seq[dbId] + 1;
    return addNode(id, { kind: 'record', databaseId: dbId, parentId: n.parentId || dbId, icon: n.icon || DATABASES[dbId].icon, seq: seq[dbId], cover: dbId === 'db_events' ? { kind: 'plate' } : null, ...n });
  };
  const ek = initialKeys(8);

  /* ------------------------------------------------------------ Events (sourced) */
  rec('db_events', 'r_evt_chandrayaan3', { title: 'Chandrayaan-3 Model Exhibition', order: ek[0], provenance: 'sourced', dateConfidence: 'year',
    props: { type: 'Exhibition', status: 'Completed', date: '', year: 2023, description: 'A model exhibition around ISRO\'s Chandrayaan-3 lunar mission.' } });
  addBlocks('r_evt_chandrayaan3', [
    H2('Overview'), P('A model exhibition around ISRO\'s Chandrayaan-3 lunar mission, listed among RECAMP\'s documented activities.'),
    CALL('Year 2023 is given in the forum\'s archive listing. The exact date has not been recorded here — add it when confirmed.', 'stellar'),
    H2('Media'), P('No photographs have been added yet.'),
  ]);

  rec('db_events', 'r_evt_cosmic_axiom4', { title: 'Cosmic Conversations · AXIOM-4 Round Table', order: ek[1], provenance: 'sourced', dateConfidence: 'year',
    props: { type: 'Discussion', status: 'Completed', date: '', year: 2025, description: 'A round-table discussion on Axiom Mission 4, filed with Cosmic Conversations as in the forum\'s own listing.' } });
  addBlocks('r_evt_cosmic_axiom4', [
    H2('Overview'), P('RECAMP\'s public record lists <i>Cosmic Conversations</i> and an <i>AXIOM-4 round-table discussion</i>. They are filed together here, following the forum\'s own archive listing.'),
    P('Axiom Mission 4 (Ax-4) was a private crewed mission to the International Space Station operated by Axiom Space.'),
    CALL('Year 2025 is given in the forum\'s archive listing. The exact date has not been recorded here.', 'stellar'),
    H2('Documentation'), P('Discussion notes have not been added yet.'),
  ]);

  rec('db_events', 'r_evt_freshers_2025', { title: 'Freshers\' Orientation 2025', order: ek[2], provenance: 'sourced', dateConfidence: 'year',
    props: { type: 'Orientation', status: 'Completed', date: '', year: 2025, description: 'Orientation for incoming students.' } });
  addBlocks('r_evt_freshers_2025', [H2('Overview'), P('Orientation for incoming students, 2025.'), CALL('Exact date not recorded here.', 'stellar')]);

  rec('db_events', 'r_evt_mini_olympics', { title: 'Mini Olympics 2.0', order: ek[3], provenance: 'sourced', dateConfidence: 'year',
    props: { type: 'Competition', status: 'Completed', date: '', year: 2025, description: 'The second edition of RECAMP\'s Mini Olympics.' } });
  addBlocks('r_evt_mini_olympics', [H2('Overview'), P('The second edition of RECAMP\'s Mini Olympics.'), CALL('Exact date and format not recorded here.', 'stellar'), H2('Outcome'), P('Not yet recorded.')]);

  rec('db_events', 'r_evt_code_conflict', { title: 'The Code of Conflict', order: ek[4], provenance: 'sourced', dateConfidence: 'year',
    props: { type: '', status: 'Completed', date: '', year: 2025, description: 'Listed among RECAMP\'s documented activities. Format and date not yet recorded here.' } });
  addBlocks('r_evt_code_conflict', [H2('Overview'), P('Listed among RECAMP\'s documented activities.'), CALL('Format and exact date have not been recorded here. The event type is deliberately left blank rather than guessed.', 'stellar')]);

  rec('db_events', 'r_evt_nexus_2026', { title: 'NEXUS 2026', order: ek[5], provenance: 'sourced', dateConfidence: 'year',
    props: { type: '', status: 'Completed', date: '', year: 2026, description: 'RECAMP took part in NEXUS 2026. Its event, Gates of Solace, is filed beneath this record.' } });
  addBlocks('r_evt_nexus_2026', [H2('Overview'), P('RECAMP took part in NEXUS 2026. Its event, <b>Gates of Solace</b>, is filed as a page beneath this record.'), CALL('Gates of Solace was held on 09 Feb 2026. The full span of NEXUS 2026 has not been recorded here.', 'stellar')]);

  rec('db_events', 'r_evt_gates_solace', { title: 'Gates of Solace', parentId: 'r_evt_nexus_2026', order: 'V', provenance: 'sourced', dateConfidence: 'exact',
    props: { type: 'Competition', status: 'Completed', date: '2026-02-09', year: 2026, parent_event: ['r_evt_nexus_2026'],
      description: 'RECAMP\'s event at NEXUS 2026: a three-round challenge built from puzzles, a treasure hunt, maze / navigation and interactive challenges.' } });
  addBlocks('r_evt_gates_solace', [
    H2('Overview'),
    P('RECAMP\'s event at NEXUS 2026, held on 9 February 2026. A three-round challenge built from puzzles, a treasure hunt, maze / navigation and interactive challenges.'),
    H2('Format'),
    B('Puzzles'), B('Treasure hunt'), B('Maze / navigation'), B('Interactive challenges'),
    H2('Rounds'),
    ['timeline', '', { stations: [
      { label: 'Round I', title: 'Round I', text: 'Details to be added by the organising team.' },
      { label: 'Round II', title: 'Round II', text: 'Details to be added by the organising team.' },
      { label: 'Round III', title: 'Round III', text: 'Details to be added by the organising team.' },
    ] }],
    CALL('Three rounds are recorded. Which format belonged to which round has not been written down here — edit the stations above once the organising team confirms.', 'stellar'),
    H2('Teams'), P('Participating teams have not been recorded here yet.'),
    H2('Tasks'), P('Open tasks linked to this event appear in the Tasks database under <i>Event → Gates of Solace</i>.'),
    H2('Media'), P('Photographs and video can be added as Image blocks, or linked from Drive as File blocks.'),
    H2('Documentation'), P('Rules, puzzle sheets and answer keys can be attached here.'),
    H2('Outcome'), P('Outcome not yet recorded.'),
  ]);

  rec('db_events', 'r_evt_higher_ed', { title: 'Higher Education Guest Lecture', order: ek[6], provenance: 'sourced', dateConfidence: 'unavailable',
    props: { type: 'Lecture', status: 'Completed', date: '', description: 'A guest lecture on higher education.' } });
  addBlocks('r_evt_higher_ed', [H2('Overview'), P('A guest lecture on higher education, listed among RECAMP\'s documented activities.'), CALL('Date unavailable. Speaker and topic details have not been recorded here.', 'stellar')]);

  /* ---------------------------------------------------------- Projects */
  const pk = initialKeys(3);
  rec('db_projects', 'r_prj_workspace', { title: 'RECAMP Workspace', order: pk[0], icon: 'orbit',
    props: { status: 'Active', area: 'Scientific Computing', start: '2026-09-01', summary: 'This system — the forum\'s internal workspace and archive. Built on a static frontend with a Google Sheets store.' } });
  addBlocks('r_prj_workspace', [
    H2('Aim'), P('Give RECAMP a single place for its pages, events, projects, tasks, research notes and history — and make that history visible.'),
    H2('Status'), P('Phase 1–3 built: shell, pages, block editor, databases, archive, research notebook, meeting notes, members, search, activity. Phase 4 (Google Sheets sync) is available from Settings once a backend is deployed.'),
    H2('Open questions'), TODO('Which Google account owns the data spreadsheet?'), TODO('Who curates the archive dates?'),
  ]);
  rec('db_projects', 'r_prj_demo_cloud', { title: 'Cloud chamber build', order: pk[1], provenance: 'demo',
    props: { status: 'Proposed', area: 'Physics', summary: 'Sample project: a diffusion cloud chamber for visualising cosmic-ray tracks at outreach events.' } });
  addBlocks('r_prj_demo_cloud', [CALL('Demo record. Replace with a real project or delete.', 'stellar'), H2('Proposal'), P('A diffusion cloud chamber using dry ice and isopropyl alcohol, for visualising cosmic-ray tracks at outreach events.')]);
  rec('db_projects', 'r_prj_demo_radio', { title: 'Low-cost radio telescope feasibility', order: pk[2], provenance: 'demo',
    props: { status: 'Proposed', area: 'Astrophysics', summary: 'Sample project: can a satellite-dish receiver detect the 21 cm hydrogen line from campus?' } });
  addBlocks('r_prj_demo_radio', [CALL('Demo record. Replace with a real project or delete.', 'stellar'), H2('Question'), P('Can a repurposed satellite dish and a software-defined radio detect the 21 cm neutral-hydrogen line from the campus rooftop?')]);

  /* ------------------------------------------------------------- Tasks (real housekeeping for this workspace) */
  const tasks = [
    ['Confirm dates for archive entries marked “Date unavailable”', 'High', 'r_prj_workspace', null],
    ['Replace placeholder member profiles with consented, real profiles', 'Medium', 'r_prj_workspace', null],
    ['Add photographs from Gates of Solace to the event page', 'Medium', 'r_prj_workspace', 'r_evt_gates_solace'],
    ['Name the three rounds of Gates of Solace on the route block', 'Low', 'r_prj_workspace', 'r_evt_gates_solace'],
    ['Connect the workspace to a Google Sheet (Settings → Storage)', 'High', 'r_prj_workspace', null],
    ['Record The Code of Conflict\'s format and date', 'Medium', 'r_prj_workspace', 'r_evt_code_conflict'],
  ];
  const tk = initialKeys(tasks.length);
  tasks.forEach(([title, priority, project, event], i) => {
    rec('db_tasks', `r_tsk_${i + 1}`, { title, order: tk[i], props: { status: 'To do', done: false, priority, project: project ? [project] : [], event: event ? [event] : [], assignee: [] } });
    addBlocks(`r_tsk_${i + 1}`, [P('')]);
  });

  /* ------------------------------------------------------------- Teams (demo) */
  const teams = [['Core Committee', 'Coordination of the forum\'s calendar, budget and communication.'], ['Events', 'Planning and running events, from proposal to documentation.'], ['Communication', 'Instagram, posters, write-ups and the archive.'], ['Technical', 'Equipment, demonstrations, and this workspace.']];
  const tmk = initialKeys(teams.length);
  teams.forEach(([title, remit], i) => { rec('db_teams', `r_tm_${i + 1}`, { title, order: tmk[i], provenance: 'demo', props: { remit, members: [], lead: [] } }); addBlocks(`r_tm_${i + 1}`, [CALL('Demo team. RECAMP\'s real team structure has not been published; rename or delete.', 'stellar'), P(remit)]); });

  /* ----------------------------------------------------------- Members (placeholders) */
  const mk = initialKeys(6);
  for (let i = 1; i <= 6; i++) {
    rec('db_members', `r_mbr_${i}`, { title: `Member placeholder ${String(i).padStart(2, '0')}`, order: mk[i - 1], provenance: 'demo', icon: 'user',
      props: { role: '', team: [], year: '', department: 'Physical Sciences', skills: [], bio: 'Placeholder profile. Replace with a real member once they have agreed to be listed.', joined: '' } });
    addBlocks(`r_mbr_${i}`, [CALL('Placeholder profile — no real person is represented here.', 'stellar')]);
  }

  /* ---------------------------------------------------------- Resources (demo, real links) */
  const res = [
    ['ISRO — Chandrayaan-3', 'Link', 'https://www.isro.gov.in/Chandrayaan3_Details.html', 'ISRO', ['Space', 'Lunar']],
    ['Axiom Space — Ax-4 mission', 'Link', 'https://www.axiomspace.com/missions/ax4', 'Axiom Space', ['Space', 'Human spaceflight']],
    ['NASA Astrophysics Data System', 'Tool', 'https://ui.adsabs.harvard.edu', 'NASA / SAO', ['Literature']],
    ['arXiv — physics', 'Paper', 'https://arxiv.org/archive/physics', 'arXiv', ['Literature', 'Preprints']],
    ['Stellarium Web', 'Tool', 'https://stellarium-web.org', 'Stellarium', ['Astronomy', 'Sky']],
    ['HyperPhysics', 'Link', 'http://hyperphysics.phy-astr.gsu.edu/hbase/index.html', 'Georgia State University', ['Physics', 'Reference']],
  ];
  const rsk = initialKeys(res.length);
  res.forEach(([title, type, url, source, topics], i) => { rec('db_resources', `r_res_${i + 1}`, { title, order: rsk[i], provenance: 'demo', icon: 'link', props: { type, url, source, topics, notes: '' } }); addBlocks(`r_res_${i + 1}`, [P(`<a href="${url}" target="_blank" rel="noopener">${url}</a>`)]); });
  nodes.db_resources.schema.find(p => p.id === 'topics').options = [...new Set(res.flatMap(r => r[4]))].map(name => ({ name, tone: 'faint' }));

  /* ----------------------------------------------------------- Research (demo) */
  const rk2 = initialKeys(3);
  rec('db_research', 'r_rsn_1', { title: 'Reading notes — Chandrayaan-3 landing site', order: rk2[0], provenance: 'demo', icon: 'flask', props: { kind: 'Scientific Reading', area: 'Astrophysics', tags: ['Lunar', 'Missions'], author: [], source: 'https://www.isro.gov.in/Chandrayaan3_Details.html' } });
  addBlocks('r_rsn_1', [CALL('Sample notebook entry — shows the shape of a reading note. Replace with real notes.', 'stellar'), H2('Summary'), P('Where the lander touched down, what the payloads measured, and what remains open.'), H2('Questions for discussion'), B('What does the thermal profile of the regolith tell us?'), B('How would we design a follow-up measurement?')]);
  rec('db_research', 'r_rsn_2', { title: 'Discussion topic — what Ax-4 means for Indian human spaceflight', order: rk2[1], provenance: 'demo', icon: 'flask', props: { kind: 'Discussion Topic', area: 'Interdisciplinary Science', tags: ['Human spaceflight'], author: [], source: '' } });
  addBlocks('r_rsn_2', [CALL('Sample discussion prompt.', 'stellar'), P('Frame the round-table: what is technically new, what is politically new, and what should students be learning now?')]);
  rec('db_research', 'r_rsn_3', { title: 'Experiment log — pendulum period vs. amplitude', order: rk2[2], provenance: 'demo', icon: 'flask', props: { kind: 'Experiment Log', area: 'Physics', tags: ['Mechanics', 'Lab'], author: [], source: '' } });
  addBlocks('r_rsn_3', [CALL('Sample experiment log.', 'stellar'), H2('Objective'), P('Measure how the period of a simple pendulum departs from the small-angle result as amplitude grows.'), H2('Setup'), P('String length L, bob mass m, release angles 5°–60°, stopwatch over 10 oscillations.'), H2('Result'), ['equation', 'T \\approx 2\\pi\\sqrt{\\frac{L}{g}}\\left(1 + \\frac{\\theta_0^2}{16}\\right)'], H2('Observations'), ['table', '', { rows: [['θ₀ (deg)', 'T (s)', 'Notes'], ['5', '', ''], ['20', '', ''], ['40', '', ''], ['60', '', '']] }]]);
  nodes.db_research.schema.find(p => p.id === 'tags').options = ['Lunar', 'Missions', 'Human spaceflight', 'Mechanics', 'Lab'].map(name => ({ name, tone: 'faint' }));

  /* ------------------------------------------------------------ Meeting notes (demo) */
  rec('db_meetings', 'r_mtg_1', { title: 'Sample — planning meeting', order: 'V', provenance: 'demo', icon: 'notes', props: { date: '', time: '', venue: '', kind: 'Planning', attendees: [], event: [] } });
  addBlocks('r_mtg_1', meetingTemplate(true));

  /* ------------------------------------------------------------- Guide & templates */
  addNode('p_guide', { kind: 'page', parentId: 'root', title: 'Workspace guide', icon: 'book', order: rootKeys[rk++] });
  addBlocks('p_guide', [
    P('This is RECAMP\'s working space: pages for anything, databases for the things that repeat, and an archive that keeps what the forum has built.'),
    H2('Moving around'),
    B('<b>Ctrl / ⌘ K</b> opens the command palette — search everything, jump anywhere, create anything.'),
    B('The sidebar tree is the map. Drag a page onto another to nest it; drag between pages to reorder.'),
    B('Every database row is a page. Open an event and write beneath its properties.'),
    H2('Writing'),
    B('Type <b>/</b> on an empty line for blocks: headings, lists, to-dos, quotes, callouts, tables, code, equations, images, a route/timeline, a nested page.'),
    B('<b>Enter</b> makes a new block, <b>Backspace</b> on an empty block removes it, <b>Tab</b> indents a list item.'),
    B('Reorder a block by dragging the handle at its left. On a phone, tap into the block and use the <b>⋯</b> button — <i>Move up</i> / <i>Move down</i>.'),
    H2('Facts and placeholders'),
    P('Records marked <span class="prov" data-prov="sourced">sourced</span> come from RECAMP\'s public record. Records marked <span class="prov" data-prov="demo">demo</span> are placeholders. Delete or replace demo content freely — nothing depends on it.'),
    H2('Storage'),
    P('By default the workspace lives in this browser. To share it, deploy <code>apps/api</code> as a Google Apps Script web app and paste its URL under <b>Settings → Storage</b>. The store then syncs to a Google Sheet the forum owns.'),
  ]);

  addNode('p_templates', { kind: 'page', parentId: 'root', title: 'Templates', icon: 'pages', order: rootKeys[rk++] });
  addBlocks('p_templates', [P('Duplicate a template (⋯ → Duplicate) and drag the copy where it belongs.')]);
  const tk2 = initialKeys(3);
  addNode('p_tpl_meeting', { kind: 'page', parentId: 'p_templates', title: 'Meeting note template', icon: 'notes', order: tk2[0] });
  addBlocks('p_tpl_meeting', meetingTemplate(false));
  addNode('p_tpl_event', { kind: 'page', parentId: 'p_templates', title: 'Event plan template', icon: 'event', order: tk2[1] });
  addBlocks('p_tpl_event', [H2('Overview'), P(''), H2('Format'), P(''), H2('Teams'), P(''), H2('Rounds'), ['timeline', '', { stations: [{ label: 'I', title: 'Round I', text: '' }, { label: 'II', title: 'Round II', text: '' }] }], H2('Tasks'), TODO('Book the venue'), TODO('Publish registration'), H2('Media'), P(''), H2('Documentation'), P(''), H2('Outcome'), P('')]);
  addNode('p_tpl_experiment', { kind: 'page', parentId: 'p_templates', title: 'Experiment log template', icon: 'flask', order: tk2[2] });
  addBlocks('p_tpl_experiment', [H2('Objective'), P(''), H2('Apparatus'), B(''), H2('Method'), ['number', ''], H2('Observations'), ['table', '', { rows: [['Trial', 'Reading', 'Notes'], ['1', '', ''], ['2', '', '']] }], H2('Analysis'), ['equation', ''], H2('Conclusion'), P('')]);

  /* --------------------------------------------------------------- activity */
  const activity = [
    { id: 'a_seed_3', at: T0, type: 'ARCHIVE IMPORTED', nodeId: 'db_events', title: 'Events', detail: '8 events from RECAMP\'s public record', actor: '' },
    { id: 'a_seed_2', at: T0, type: 'PAGE CREATED', nodeId: 'p_about', title: 'About RECAMP', detail: '', actor: '' },
    { id: 'a_seed_1', at: T0, type: 'WORKSPACE OPENED', nodeId: null, title: 'RECAMP Observatory', detail: 'Local workspace initialised', actor: '' },
  ];

  return {
    v: 1, savedAt: T0,
    meta: { seedVersion: SEED_VERSION, workspace: { name: 'RECAMP', descriptor: 'The Physical Science Forum', institution: 'Jain (Deemed-to-be University) · School of Sciences · Bengaluru', coords: '12.9716 N / 77.5946 E' }, user: { id: 'me', name: '' } },
    settings: { theme: 'dark', sidebar: 'open' },
    nodes: JSON.parse(JSON.stringify(nodes)), blocks: JSON.parse(JSON.stringify(blocks)), activity,
    favorites: ['db_events', 'r_evt_gates_solace'], recent: [],
  };
}

function meetingTemplate(sample) {
  return [
    sample ? CALL('Sample note — the fields below are empty on purpose. No meeting is being reported.', 'stellar') : CALL('Fill the properties above (date, time, venue, kind) and the sections below.'),
    H2('Attendees'), B(''),
    H2('Agenda'), ['number', ''],
    H2('Discussion'), P(''),
    H2('Decisions'), B(''),
    H2('Action items'), TODO(''),
    H2('Next steps'), P(''),
    H2('Linked event'), P('Set the <i>Linked Event</i> property to connect these notes to an event record.'),
  ];
}
