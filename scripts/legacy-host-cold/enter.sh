#!/bin/sh
# Root creates isolated network/mount namespaces; all browser/controller code runs as probe.
set -eu
[ "$(id -u)" = 0 ]
[ "$#" -ge 2 ]
policy="$1"
shift
case "$policy" in deny|allow|origin|missing|malformed|ignored|exception|recommended) ;; *) exit 64 ;; esac
mount --make-rprivate /
ip link set lo up
if [ "$policy" = recommended ] || [ "$policy" = ignored ]; then
  mount --bind /opt/done-cold/policies/missing /etc/chromium/policies/managed
  if [ "$policy" = recommended ]; then
    mount --bind /opt/done-cold/policies/recommended /etc/chromium/policies/recommended
    mount -o remount,bind,ro /etc/chromium/policies/recommended
  fi
else
  mount --bind "/opt/done-cold/policies/$policy" /etc/chromium/policies/managed
fi
mount -o remount,bind,ro /etc/chromium/policies/managed
exec runuser -u probe -- /usr/bin/setpriv --no-new-privs -- /usr/bin/node "$@"
