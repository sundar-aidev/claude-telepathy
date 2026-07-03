import json, sys, collections
path = sys.argv[1]
meta = {}; edits = []; prompts = []; compacts = 0; sidechain = 0; records = 0
branches = collections.Counter(); cwds = collections.Counter(); types = collections.Counter()
first_ts = last_ts = None
for line in open(path):
    line = line.strip()
    if not line: continue
    try: r = json.loads(line)
    except: continue
    records += 1
    t = r.get('type'); types[t] += 1
    if t in ('summary','custom-title','ai-title','last-prompt','task-summary','tag'):
        meta[t] = r.get('summary') or r.get('customTitle') or r.get('aiTitle') or r.get('lastPrompt') or r.get('taskSummary') or r.get('tag')
    if r.get('isSidechain'): sidechain += 1
    if r.get('gitBranch'): branches[r['gitBranch']] += 1
    if r.get('cwd'): cwds[r['cwd']] += 1
    ts = r.get('timestamp')
    if ts: first_ts = first_ts or ts; last_ts = ts
    if t == 'user' and not r.get('isSidechain'):
        m = r.get('message', {})
        c = m.get('content')
        if isinstance(c, str) and c and not c.startswith('<'): prompts.append(c[:100])
        elif isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type')=='text' and not b.get('text','').startswith('<'):
                    prompts.append(b['text'][:100]); break
    if t == 'assistant' and not r.get('isSidechain'):
        for b in (r.get('message',{}).get('content') or []):
            if isinstance(b, dict) and b.get('type')=='tool_use' and b.get('name') in ('Edit','Write','MultiEdit'):
                fp = (b.get('input') or {}).get('file_path')
                if fp: edits.append(fp)
    if r.get('parentUuid') is None and records > 1 and t in ('user','assistant'): compacts += 1
print(json.dumps({
  'records': records, 'types': dict(types.most_common(8)), 'meta': meta,
  'cwd': cwds.most_common(1), 'branches': branches.most_common(3),
  'first_ts': first_ts, 'last_ts': last_ts,
  'sidechain_records': sidechain, 'compact_boundaries(parentUuid=null mid-file)': compacts,
  'n_user_prompts': len(prompts), 'first_prompt': prompts[0] if prompts else None,
  'last_prompt': prompts[-1] if prompts else None,
  'n_file_edits': len(edits), 'distinct_files': len(set(edits)),
  'sample_edited_files': list(dict.fromkeys(edits))[:5],
}, indent=1, default=str))
