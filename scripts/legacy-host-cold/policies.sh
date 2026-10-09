#!/bin/sh
# Synthetic runtime only. Root-owned policies are readonly to browser/controller processes.
set -eu
[ "$(id -u)" = 0 ]
install -d -m 755 /opt/done-cold/policies /etc/chromium/policies/managed /etc/chromium/policies/recommended
for mode in deny allow origin missing malformed ignored exception recommended; do
  install -d -m 755 "/opt/done-cold/policies/$mode"
done
printf '%s\n' '{"DefaultJavaScriptSetting":2}' > /opt/done-cold/policies/deny/denial.json
printf '%s\n' '{"DefaultJavaScriptSetting":1}' > /opt/done-cold/policies/allow/denial.json
printf '%s\n' '{"DefaultJavaScriptSetting":1,"JavaScriptBlockedForUrls":["http://127.0.0.1:43101"]}' > /opt/done-cold/policies/origin/denial.json
printf '%s\n' '{' > /opt/done-cold/policies/malformed/denial.json
printf '%s\n' '{"DefaultJavaScriptSetting":2,"JavaScriptAllowedForUrls":["http://127.0.0.1:43101"]}' > /opt/done-cold/policies/exception/denial.json
printf '%s\n' '{"DefaultJavaScriptSetting":2}' > /opt/done-cold/policies/ignored/not-policy.txt
printf '%s\n' '{"DefaultJavaScriptSetting":2}' > /opt/done-cold/policies/recommended/denial.json
chmod -R a-w /opt/done-cold/policies
