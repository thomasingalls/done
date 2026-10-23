/** Diagnostic observations only: UI progress never supplies protocol or commit authority. */
const finite = (v) => {
  if (!Number.isFinite(v)) throw Error('Non-finite observation');
  return v;
};
const integer = (v) => {
  if (!Number.isSafeInteger(v) || v < 0) throw Error('Invalid counter');
  return v;
};
export function quantiles(values) {
  const sorted = values.map(finite).sort((a, b) => a - b);
  return sorted.length
    ? {
        n: sorted.length,
        min: sorted[0],
        p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted.at(-1),
      }
    : { n: 0 };
}
export function inputLatencies(result, expectedInputs = 120) {
  if (!Number.isSafeInteger(expectedInputs) || expectedInputs < 1)
    throw Error('Invalid input denominator');
  const start = finite(result.startedAt),
    finish = finite(result.typingFinishedAt);
  if (
    finish < start ||
    result.offers.length !== expectedInputs ||
    result.probesAtDeadline.length !== 2
  )
    throw Error('Incomplete input evidence');
  result.offers.forEach((offer, index) => {
    if (
      offer.index !== index ||
      finite(offer.at) < start ||
      finite(offer.scheduledAt) < start ||
      finite(offer.returnedAt) < offer.at
    )
      throw Error('Invalid offered input');
    if (index && offer.at < result.offers[index - 1].at) throw Error('Input order changed');
  });
  const inputs = result.probesAtDeadline[0].events.filter(
    (v) => v.kind === 'beforeinput' && finite(v.at) >= start && v.at <= finish,
  );
  if (
    inputs.length !== expectedInputs ||
    inputs.some((v) => !v.trusted || !v.focused || v.visible !== 'visible')
  )
    throw Error('Untrusted or incomplete input evidence');
  const timings = result.probesAtDeadline.map((probe) => {
    let previous = -Infinity;
    for (const sample of probe.lengths) {
      if (finite(sample.at) < previous || !Number.isSafeInteger(sample.length))
        throw Error('Invalid display observations');
      previous = sample.at;
    }
    const baseline = probe.lengths.filter((v) => v.at <= start).at(-1);
    if (!baseline || baseline.length < 0) throw Error('Missing display baseline');
    return result.offers.map((offer, i) => {
      const sample = probe.lengths.find(
        (v) => v.at >= offer.at - 5 && v.length >= baseline.length + i + 1,
      );
      return sample ? sample.at - offer.at : null;
    });
  });
  const summarize = (values) => ({
    complete: values.every((v) => v !== null),
    missing: values.filter((v) => v === null).length,
    observed: quantiles(values.filter((v) => v !== null)),
  });
  return {
    keys: result.offers.map((offer, i) => ({
      index: i,
      offerAt: offer.at,
      localMs: timings[0][i],
      peerMs: timings[1][i],
    })),
    local: summarize(timings[0]),
    peer: summarize(timings[1]),
  };
}
export function submissionCadence(network, { label = 'Q0', phase = 'measured' } = {}) {
  const requests = network.filter(
    (v) => v.label === label && v.phase === phase && v.path === '/account/delivery/submit',
  );
  const identities = new Set(),
    times = [],
    latencies = [],
    statuses = {};
  for (const row of requests) {
    if (!/^[a-f0-9]{64}$/.test(row.bodySha256)) throw Error('Missing exact request identity');
    identities.add(row.bodySha256);
    times.push(finite(row.at));
    if (row.headersAt !== undefined) {
      if (finite(row.headersAt) < row.at || !Number.isSafeInteger(row.status))
        throw Error('Invalid HTTP observation');
      latencies.push(row.headersAt - row.at);
    }
    const status = row.status === undefined ? 'unobserved' : String(row.status);
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  times.sort((a, b) => a - b);
  return {
    requests: requests.length,
    uniqueBodies: identities.size,
    repeatedBodyAttempts: requests.length - identities.size,
    statuses,
    responseObservationsComplete: latencies.length === requests.length,
    observedLatencyMs: quantiles(latencies),
    interArrivalMs: quantiles(times.slice(1).map((at, i) => at - times[i])),
  };
}
export function displayedBacklog(sender, receiver, start, end) {
  finite(start);
  finite(end);
  if (end < start) throw Error('Reversed observation window');
  const streams = [
    [sender, 'accepted'],
    [receiver, 'received'],
  ];
  const baselines = [],
    events = [];
  for (const [stream, field] of streams) {
    let at = -Infinity;
    for (const sample of stream) {
      if (finite(sample.at) < at) throw Error('Progress order changed');
      at = sample.at;
    }
    const base = stream.filter((v) => v.at <= start).at(-1);
    if (!base) throw Error('Missing progress baseline');
    integer(base[field]);
    baselines.push(base[field]);
    let counter = base[field];
    for (const sample of stream.filter((v) => v.at > start && v.at <= end)) {
      integer(sample[field]);
      if (sample[field] < counter) throw Error('Displayed progress regressed');
      counter = sample[field];
      events.push({ at: sample.at, field, delta: counter - base[field] });
    }
  }
  events.sort((a, b) => a.at - b.at);
  let accepted = 0,
    received = 0,
    last = start,
    area = 0;
  const samples = [{ at: start, acceptedDelta: 0, receivedDelta: 0, pendingDelta: 0 }];
  for (let i = 0; i < events.length;) {
    const at = events[i].at;
    area += (accepted - received) * (at - last);
    last = at;
    do {
      const event = events[i++];
      if (event.field === 'accepted') accepted = event.delta;
      else received = event.delta;
    } while (i < events.length && events[i].at === at);
    samples.push({
      at,
      acceptedDelta: accepted,
      receivedDelta: received,
      pendingDelta: accepted - received,
    });
  }
  area += (accepted - received) * (end - last);
  return {
    kind: 'displayed-progress-proxy',
    baselineAccepted: baselines[0],
    baselineReceived: baselines[1],
    maxPendingDelta: Math.max(...samples.map((v) => v.pendingDelta)),
    minPendingDelta: Math.min(...samples.map((v) => v.pendingDelta)),
    pendingAtEnd: accepted - received,
    backlogAreaPositionMs: area,
    samples,
    limitation:
      'UI notifications and renderer clocks; not native acceptance, durable ingestion or proof of missing writing.',
  };
}
