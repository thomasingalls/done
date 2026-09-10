#!/bin/sh
# Run only inside the dedicated VM described by lima.yaml, before any synthetic profile exists.
set -eu
[ "$(id -u)" = 0 ]
. /etc/os-release
[ "$ID" = debian ]
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends chromium=152.0.7977.82-1~deb13u1 chromium-sandbox=152.0.7977.82-1~deb13u1 nodejs=20.19.2+dfsg-1+deb13u2 node-undici=7.3.0+dfsg1+~cs24.12.11-1 iproute2 util-linux ca-certificates xvfb xauth fonts-liberation
install -d -o probe -g probe /home/probe/cold /home/probe/cold-output
sh "$(dirname "$0")/policies.sh"
