# Recovery choices and first-publication scope

2026-10-10. The operator chose operator-led recovery for first publication, accepting that some
writing may be lost. Automatic reconciliation is deferred. This supersedes the earlier same-day
requirement to finish automatic reconciliation before publication. No replication destination or
synchronous off-host confirmation policy is selected.

## What the first version promises

Keep the agreed encrypted SQLite snapshots and their 30-second change-check cadence. The achieved
recovery point is the last verified complete backup, not a guaranteed 30-second window through failures.
Recovery is an explicit offline operator operation into isolated storage. Verify the archive, service
identity, schema and database integrity, invalidate restored network logins, and refresh session custody.
An older membership or acceptance ledger must not silently become current merely because it passes
integrity checks. The restored copy remains quarantined pending an operator recovery disposition.

Operator involvement does not supply missing history. If continuity cannot be established, preserve
surviving browser state and exports, and use a deliberately fresh service/account history with supported
content import, accepting loss of unavailable writing and identities. Do not clear browsers as a first
recovery step, turn off client rollback checks, or expose old membership while investigating it. A fresh
service identity is an explicit reset with client setup/import consequences, not an ordinary restore.
The isolated restored database remains evidence; no production state is overwritten by the restore tool.

This is not automatic disaster failover, guaranteed lossless recovery, or a completed client reconciliation
protocol. Release validation stays paused. Actual recovery of personal/customer data requires incident-
specific operator action; implementation checks use disposable data.

## Options retained for a later decision

| Option | Protects against / enables | Cost and remaining boundary |
| --- | --- | --- |
| Snapshots with operator recovery (selected now) | Reconstructs a verified backup; operator handles uncertain history and any reset/import | May lose writing; recovery takes human work; older signed state cannot simply resume |
| Snapshots plus automatic client reconciliation | Can fill gaps for which surviving clients retain sufficient authenticated evidence | Requires a new protocol; cannot infer an unseen revocation when its evidence is gone |
| Database on retained network volume, log on VM disk, asynchronous B2 archival | Potential automatic recovery if either current storage copy survives, using a covered snapshot plus complete log | Must implement durable confirmation, log coverage and restart ownership; combined loss can leave a gap; shared administration is a correlated risk |
| Second node with asynchronous replication | Another current-ish copy and somewhere to restart | Acknowledged operations may still be missing; replication lag is a recovery gap |
| Second node with synchronous log/database replication | Can preserve confirmed operations after one copy fails, if the other survives | Confirmation depends on replication; automatic writer failover needs fencing/coordination; shared-site failures remain |
| Independent remote log durable before confirmation | Recovery need not depend on surviving devices or the original host, if backup and log survive | Adds remote latency, request costs and dependency outages to confirmation; batching and visibility ordering need design |

One writer plus a log receiver may suffice; active/active databases are not required. Another Kubernetes
node without a durable replica does not protect data. Automatic reconstruction and automatic writer
failover are separate capabilities. Failover must prevent two writers after a network partition; accepting
brief outages permits operator-controlled fencing without abandoning automatic reconstruction later.

B2/object storage is well suited to immutable archived segments but has not been measured or selected
as a synchronous commit destination. No cost, latency or failure probability is asserted here.

## Log retention is coverage-based

A verified snapshot through operation N makes the earlier log dispensable for recovery from that
snapshot. Keep the entire suffix after N, including during slow or failed backups. At a healthy 30-second
cadence the needed tail is ordinarily tens of seconds plus processing/upload time; retaining a fallback
snapshot needs a longer tail. This is not a timer-based permission to delete records. A capacity bound
must stop new confirmations rather than discard uncovered history. Rolling an older retained daily
snapshot forward to current state needs every intervening log segment; old snapshots without that
suffix are historical recovery material, not equivalent current-state recovery sets.

## Failure assumptions to revisit

The infrastructure repository prepares a retained Hetzner network volume; its provider stores blocks
on three physical servers. The VM's primary disk is a separate storage resource. That separation can
help with an individual storage loss, but does not establish independent probabilities: automation,
credentials, application bugs, infrastructure resets and site incidents can affect multiple copies.
VM rebuild/deletion can lose data without a physical SSD failure. An outage is not necessarily loss;
waiting for intact storage can be safer than restoring stale state.

References checked during the discussion:

- [Hetzner volume architecture](https://docs.hetzner.com/cloud/volumes/overview/).
- [Hetzner server lifecycle and rebuild behavior](https://docs.hetzner.com/cloud/servers/faq/).
- `ol-infra/infra/hcloud-csi/values.yaml`: explicit `hcloud-volumes-retain` storage class.
- [Service ledger rollback boundary](./account-service-delivery.md#completeness-witness).
- [Deployment plan](./public-deployment.md) and [backup contract](./public-backups.md).
