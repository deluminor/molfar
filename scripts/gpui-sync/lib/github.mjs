import { execFileSync } from 'node:child_process';

export const github = {
  list(repository) {
    const output = execFileSync('gh', ['pr', 'list', '--repo', `github.com/${repository}`, '--state', 'open', '--limit', '1000', '--json', 'number,url,baseRefName,headRefName,headRefOid,isDraft,headRepositoryOwner,headRepository,body'], { encoding: 'utf8' });
    return JSON.parse(output);
  },
  create(repository, branch, base, source, target) {
    return execFileSync('gh', ['pr', 'create', '--repo', `github.com/${repository}`, '--head', branch, '--base', base, '--draft', '--title', `Sync GPUI upstream ${source.slice(0, 12)}`, '--body', `Frozen upstream source: ${source}\nTarget base: ${target}\n\nReview the merge and unresolved ledger before integration.`], { encoding: 'utf8' }).trim();
  },
};
