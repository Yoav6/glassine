import { ingestGitUpdatesSafe } from './git-ingest';

const INTERVAL_MS = 1000;

let refs = 0;
let timer: ReturnType<typeof setInterval> | undefined;

export function retainLiveIngest() {
	refs += 1;
	if (timer) return;
	void ingestGitUpdatesSafe();
	timer = setInterval(() => {
		void ingestGitUpdatesSafe();
	}, INTERVAL_MS);
}

export function releaseLiveIngest() {
	refs = Math.max(0, refs - 1);
	if (refs > 0 || !timer) return;
	clearInterval(timer);
	timer = undefined;
}
