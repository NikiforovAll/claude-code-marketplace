// Stands in for `claude -p --input-format stream-json`. FAKE_CLAUDE_MODE: answer
// (default) replies to a reload_plugins control request, exit quits at once, hang
// never replies. Built-ins alpha and beta load unless --settings disables them;
// off loads only when --settings enables it.
const settingsArg = process.argv.indexOf('--settings');
const enabled = settingsArg > 0 ? JSON.parse(process.argv[settingsArg + 1]).enabledPlugins || {} : {};
const on = (name, byDefault) => enabled[`${name}@builtin`] ?? byDefault;

const mode = process.env.FAKE_CLAUDE_MODE || 'answer';
if (mode === 'exit') process.exit(0);

const BUILTINS = {
  'cc-plugin-alpha': { byDefault: true, commands: ['alpha-skill'], agents: ['alpha-agent'], mcpServers: [] },
  'cc-plugin-beta': { byDefault: true, commands: [], agents: [], mcpServers: ['beta-mcp'] },
  'cc-plugin-off': { byDefault: false, commands: ['off-skill'], agents: [], mcpServers: [] },
};

// The plugin definitions as the bundle spells them, for scanDescriptions.
// var b4e="cc-plugin-beta";var L="Beta: an MCP server — for tests";
// {name:"cc-plugin-alpha",description:"Alpha: a skill and an agent",isAvailable:F};
// {name:b4e,description:L,isAvailable:G}

const DESCRIPTIONS = { 'alpha-skill': 'Does alpha things', 'alpha-agent': 'Runs alpha', help: 'Shows help' };
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  const nl = buf.indexOf('\n');
  if (nl < 0 || mode === 'hang') return;
  const req = JSON.parse(buf.slice(0, nl));
  const loaded = Object.entries(BUILTINS).filter(([name, b]) => on(name, b.byDefault));
  const list = (key, shared) =>
    [...shared, ...loaded.flatMap(([, b]) => b[key])].map((name) => ({ name, description: DESCRIPTIONS[name] }));
  out({ type: 'system', subtype: 'hook_started' });
  process.stdout.write('not json\n');
  out({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: req.request_id,
      response: {
        plugins: [
          ...loaded.map(([name]) => ({ name, path: 'builtin', source: `${name}@builtin` })),
          { name: 'other', path: '/plugins/other', source: 'other@market' },
          { name: 'bad', path: 'builtin', source: 'x@y@builtin' },
        ],
        commands: list('commands', ['help', 'other:skill']),
        agents: list('agents', ['Explore']),
        mcpServers: list('mcpServers', ['plugin:other:mcp']),
      },
    },
  });
});
