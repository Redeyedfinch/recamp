/**
 * Schema: property types, the domain vocabularies, and the database
 * definitions that seed the workspace. Databases are data — a member can add
 * a property without touching this file — but these are the defaults.
 *
 * Select values are stored by *name* (props.status = 'Completed'), so a row
 * in the backing Sheet reads like a row in a Sheet should.
 */

export const PROP_TYPES = {
  text:        { label: 'Text' },
  select:      { label: 'Select' },
  multiselect: { label: 'Multi-select' },
  date:        { label: 'Date' },
  time:        { label: 'Time' },
  person:      { label: 'Person' },        // relation → Members
  relation:    { label: 'Relation' },
  checkbox:    { label: 'Checkbox' },
  url:         { label: 'URL' },
  number:      { label: 'Number' },
  files:       { label: 'Files' },
  created:     { label: 'Created' },
  updated:     { label: 'Updated' },
};

const opt = (name, tone = 'faint') => ({ name, tone });

export const EVENT_STATUS = [
  opt('Planning', 'faint'), opt('Confirmed', 'celestial'), opt('Upcoming', 'celestial'),
  opt('Live', 'stellar'), opt('Completed', 'sage'), opt('Archived', 'faint'),
];
export const EVENT_TYPE = [
  opt('Competition', 'celestial'), opt('Lecture', 'violet'), opt('Debate', 'stellar'), opt('Exhibition', 'celestial'),
  opt('Workshop', 'sage'), opt('Orientation', 'faint'), opt('Discussion', 'violet'), opt('Inter-Collegiate', 'stellar'), opt('Project', 'sage'),
];
export const PROJECT_STATUS = [
  opt('Proposed', 'faint'), opt('Active', 'celestial'), opt('Paused', 'stellar'), opt('Completed', 'sage'), opt('Archived', 'faint'),
];
export const RESEARCH_AREA = [
  opt('Physics', 'celestial'), opt('Electronics', 'stellar'), opt('Astrophysics', 'violet'),
  opt('Scientific Computing', 'sage'), opt('Materials', 'faint'), opt('Interdisciplinary Science', 'celestial'),
];
export const TASK_STATUS = [opt('To do', 'faint'), opt('In progress', 'celestial'), opt('Done', 'sage')];
export const TASK_PRIORITY = [opt('Low', 'faint'), opt('Medium', 'celestial'), opt('High', 'stellar')];
export const RESOURCE_TYPE = [
  opt('Link', 'celestial'), opt('Paper', 'violet'), opt('Dataset', 'sage'), opt('Slides', 'stellar'), opt('Video', 'faint'), opt('Book', 'faint'), opt('Tool', 'celestial'),
];
export const RESEARCH_KIND = [
  opt('Research Note', 'celestial'), opt('Scientific Reading', 'violet'), opt('Paper Summary', 'violet'),
  opt('Experiment Log', 'sage'), opt('Idea', 'stellar'), opt('Discussion Topic', 'celestial'), opt('Guest Lecture Notes', 'faint'),
];
export const MEMBER_ROLE = [
  opt('Member', 'faint'), opt('Volunteer', 'faint'), opt('Coordinator', 'celestial'), opt('Core Committee', 'stellar'), opt('Faculty Coordinator', 'violet'), opt('Alumni', 'sage'),
];
export const YEAR = [opt('I Year'), opt('II Year'), opt('III Year'), opt('IV Year'), opt('Postgraduate'), opt('Faculty')];
export const MEETING_KIND = [opt('Core Committee', 'stellar'), opt('Planning', 'celestial'), opt('Review', 'sage'), opt('General Body', 'violet')];

export function toneOf(options, value) {
  return options?.find(o => o.name === value)?.tone || 'faint';
}

/** Property factory */
export const P = {
  text:   (id, name, extra = {}) => ({ id, name, type: 'text', ...extra }),
  select: (id, name, options, extra = {}) => ({ id, name, type: 'select', options, ...extra }),
  multi:  (id, name, options, extra = {}) => ({ id, name, type: 'multiselect', options, ...extra }),
  date:   (id, name, extra = {}) => ({ id, name, type: 'date', ...extra }),
  time:   (id, name, extra = {}) => ({ id, name, type: 'time', ...extra }),
  person: (id, name, extra = {}) => ({ id, name, type: 'person', target: 'db_members', ...extra }),
  rel:    (id, name, target, extra = {}) => ({ id, name, type: 'relation', target, ...extra }),
  check:  (id, name, extra = {}) => ({ id, name, type: 'checkbox', ...extra }),
  url:    (id, name, extra = {}) => ({ id, name, type: 'url', ...extra }),
  number: (id, name, extra = {}) => ({ id, name, type: 'number', ...extra }),
  files:  (id, name, extra = {}) => ({ id, name, type: 'files', ...extra }),
  created:(id = 'created', name = 'Created') => ({ id, name, type: 'created' }),
  updated:(id = 'updated', name = 'Updated') => ({ id, name, type: 'updated' }),
};

const view = (id, name, type, extra = {}) => ({ id, name, type, filters: [], sorts: [], hidden: [], ...extra });

/** The eight domain databases. Keys are their fixed node ids. */
export const DATABASES = {
  db_events: {
    title: 'Events', icon: 'calendar', catalogue: 'EVT',
    description: 'Every event is an observation. Planning through archive, each one a page.',
    schema: [
      P.date('date', 'Date'), P.time('time', 'Time'), P.text('venue', 'Venue'),
      P.select('type', 'Event Type', EVENT_TYPE), P.person('lead', 'Lead'),
      P.rel('team', 'Team', 'db_teams'), P.select('status', 'Status', EVENT_STATUS),
      P.text('description', 'Description', { long: true }), P.url('registration', 'Registration'),
      P.files('attachments', 'Attachments'), P.rel('parent_event', 'Part of', 'db_events'),
    ],
    views: [
      view('v_table', 'All events', 'table', { sorts: [{ prop: 'date', dir: 'desc' }], hidden: ['description', 'registration', 'attachments', 'parent_event'] }),
      view('v_board', 'By status', 'board', { groupBy: 'status' }),
      view('v_cal', 'Calendar', 'calendar', { dateProp: 'date' }),
      view('v_timeline', 'Timeline', 'timeline', { dateProp: 'date' }),
      view('v_gallery', 'Gallery', 'gallery'),
    ],
  },
  db_projects: {
    title: 'Projects', icon: 'compass', catalogue: 'PRJ',
    description: 'Active trajectories — research initiatives with a lead, a team and a deadline.',
    schema: [
      P.person('lead', 'Lead'), P.rel('team', 'Team', 'db_teams'), P.select('status', 'Status', PROJECT_STATUS),
      P.date('start', 'Start Date'), P.date('deadline', 'Deadline'), P.select('area', 'Research Area', RESEARCH_AREA),
      P.text('summary', 'Summary', { long: true }),
    ],
    views: [
      view('v_table', 'All projects', 'table', { hidden: ['summary'] }),
      view('v_board', 'By status', 'board', { groupBy: 'status' }),
      view('v_timeline', 'Timeline', 'timeline', { dateProp: 'start', endProp: 'deadline' }),
    ],
  },
  db_tasks: {
    title: 'Tasks', icon: 'task', catalogue: 'TSK',
    description: 'What needs doing, who is doing it, and by when.',
    schema: [
      P.select('status', 'Status', TASK_STATUS), P.person('assignee', 'Assignee'), P.date('due', 'Due'),
      P.select('priority', 'Priority', TASK_PRIORITY), P.rel('project', 'Project', 'db_projects'),
      P.rel('event', 'Event', 'db_events'), P.check('done', 'Done'),
    ],
    views: [
      view('v_board', 'Board', 'board', { groupBy: 'status' }),
      view('v_table', 'All tasks', 'table', { sorts: [{ prop: 'due', dir: 'asc' }] }),
      view('v_cal', 'Due dates', 'calendar', { dateProp: 'due' }),
    ],
  },
  db_teams: {
    title: 'Teams', icon: 'users', catalogue: 'TM',
    description: 'Working groups within the forum.',
    schema: [
      P.person('lead', 'Lead'), P.rel('members', 'Members', 'db_members', { many: true }),
      P.text('remit', 'Remit', { long: true }),
    ],
    views: [view('v_table', 'All teams', 'table', { hidden: ['remit'] }), view('v_gallery', 'Gallery', 'gallery')],
  },
  db_members: {
    title: 'Members', icon: 'user', catalogue: 'MBR',
    description: 'The member directory. Placeholder profiles until real information is provided.',
    schema: [
      P.select('role', 'Role', MEMBER_ROLE), P.rel('team', 'Team', 'db_teams'), P.select('year', 'Year', YEAR),
      P.text('department', 'Department'), P.multi('skills', 'Skills', []), P.text('bio', 'Bio', { long: true }),
      P.date('joined', 'Joined'), P.url('profile_image', 'Profile Image'),
    ],
    views: [view('v_gallery', 'Directory', 'gallery'), view('v_table', 'Table', 'table', { hidden: ['bio', 'profile_image'] }), view('v_board', 'By role', 'board', { groupBy: 'role' })],
  },
  db_resources: {
    title: 'Resources', icon: 'book', catalogue: 'RES',
    description: 'Reference material worth keeping: links, papers, datasets, slides.',
    schema: [
      P.select('type', 'Type', RESOURCE_TYPE), P.url('url', 'URL'), P.text('source', 'Source'),
      P.multi('topics', 'Topics', []), P.person('added_by', 'Added by'), P.text('notes', 'Notes', { long: true }),
    ],
    views: [view('v_table', 'All resources', 'table', { hidden: ['notes'] }), view('v_board', 'By type', 'board', { groupBy: 'type' })],
  },
  db_meetings: {
    title: 'Meeting Notes', icon: 'notes', catalogue: 'MTG',
    description: 'Field notes from every sitting: agenda, decisions, action items.',
    schema: [
      P.date('date', 'Date'), P.time('time', 'Time'), P.text('venue', 'Venue'),
      P.select('kind', 'Kind', MEETING_KIND), P.rel('attendees', 'Attendees', 'db_members', { many: true }),
      P.rel('event', 'Linked Event', 'db_events'),
    ],
    views: [view('v_table', 'All notes', 'table', { sorts: [{ prop: 'date', dir: 'desc' }] }), view('v_cal', 'Calendar', 'calendar', { dateProp: 'date' })],
  },
  db_research: {
    title: 'Research', icon: 'flask', catalogue: 'RSN',
    description: 'A scientific notebook: notes, reading, summaries, experiment logs, ideas.',
    schema: [
      P.select('kind', 'Kind', RESEARCH_KIND), P.select('area', 'Area', RESEARCH_AREA), P.person('author', 'Author'),
      P.multi('tags', 'Tags', []), P.url('source', 'Source'), P.rel('project', 'Project', 'db_projects'),
    ],
    views: [view('v_table', 'Notebook', 'table', { sorts: [{ prop: 'updated', dir: 'desc' }] }), view('v_board', 'By kind', 'board', { groupBy: 'kind' })],
  },
};

export const DB_IDS = Object.keys(DATABASES);

/** Block types the editor understands. `slash` is the /command; `label` the menu text. */
export const BLOCK_TYPES = {
  paragraph: { label: 'Text',           slash: ['text', 'paragraph', 'p'],  icon: 'text',     desc: 'Plain writing' },
  h1:        { label: 'Heading 1',      slash: ['h1', 'heading', 'heading1'], icon: 'h1',     desc: 'Section title' },
  h2:        { label: 'Heading 2',      slash: ['h2', 'heading2'],          icon: 'h2',       desc: 'Subsection' },
  h3:        { label: 'Heading 3',      slash: ['h3', 'heading3'],          icon: 'h3',       desc: 'Minor heading' },
  bullet:    { label: 'Bulleted list',  slash: ['bullet', 'ul', 'list'],    icon: 'bullets',  desc: 'Unordered list' },
  number:    { label: 'Numbered list',  slash: ['number', 'ol', 'numbered'], icon: 'numbers', desc: 'Ordered list' },
  todo:      { label: 'To-do',          slash: ['todo', 'task', 'check'],   icon: 'todo',     desc: 'A checkbox' },
  quote:     { label: 'Quote',          slash: ['quote', 'blockquote'],     icon: 'quote',    desc: 'Pulled text' },
  callout:   { label: 'Callout',        slash: ['callout', 'note', 'aside'], icon: 'info',    desc: 'Annotated aside' },
  divider:   { label: 'Divider',        slash: ['divider', 'hr', 'rule'],   icon: 'divider',  desc: 'Hairline rule' },
  image:     { label: 'Image',          slash: ['image', 'img', 'photo'],   icon: 'image',    desc: 'From a URL' },
  file:      { label: 'File',           slash: ['file', 'attachment'],      icon: 'file',     desc: 'Link to a file' },
  link:      { label: 'Link',           slash: ['link', 'bookmark', 'url'], icon: 'link',     desc: 'Web bookmark' },
  table:     { label: 'Table',          slash: ['table', 'grid'],           icon: 'table',    desc: 'Simple table' },
  toggle:    { label: 'Toggle',         slash: ['toggle', 'collapse'],      icon: 'toggle',   desc: 'Collapsible section' },
  code:      { label: 'Code',           slash: ['code', 'pre'],             icon: 'code',     desc: 'Monospace block' },
  equation:  { label: 'Equation',       slash: ['equation', 'math', 'latex', 'eq'], icon: 'sigma', desc: 'LaTeX, rendered' },
  page:      { label: 'Page',           slash: ['page', 'subpage'],         icon: 'page',     desc: 'A nested page' },
  database:  { label: 'Database',       slash: ['database', 'db'],          icon: 'database', desc: 'An inline database' },
  event:     { label: 'Event',          slash: ['event'],                   icon: 'event',    desc: 'New event record' },
  timeline:  { label: 'Route / Timeline', slash: ['timeline', 'route', 'rounds', 'steps'], icon: 'timeline', desc: 'Stations on a line' },
};

export const TEXT_BLOCKS = new Set(['paragraph', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'callout', 'toggle']);
