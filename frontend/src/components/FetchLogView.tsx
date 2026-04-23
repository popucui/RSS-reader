import type { FetchRun } from '../../../src/types';

interface FetchLogViewProps {
  runs: FetchRun[];
}

export default function FetchLogView({ runs }: FetchLogViewProps) {
  return (
    <section className="runs">
      <div className="run-grid">
        {runs.map((run) => (
          <div key={run.id} className="run-row">
            <strong>{run.sourceName}</strong>
            <span>{run.status}</span>
            <span>{run.newCount}/{run.itemCount} new</span>
            <span>{run.requestCount} requests</span>
            {run.error ? <em>{run.error}</em> : <span />}
          </div>
        ))}
      </div>
    </section>
  );
}
