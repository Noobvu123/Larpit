#!/bin/bash
set -euo pipefail
exec /bin/bash "$(dirname "$0")/scripts/mac-launch.sh" testflight
