#!/usr/bin/env bash
set -euo pipefail

version="1.1.3"
asset="wireproxy_linux_amd64.tar.gz"
expected_sha256="e88c1d090740373fc606c1bafd81d9a5eadc642cce5667616e20e9d7a444f51c"
install_dir=".render-bin"
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT

mkdir -p "$install_dir"
curl --proto '=https' --tlsv1.2 -fsSL \
	"https://github.com/windtf/wireproxy/releases/download/v${version}/${asset}" \
	-o "$archive"
printf '%s  %s\n' "$expected_sha256" "$archive" | sha256sum --check --status
tar -tzf "$archive" | grep -Fxq "wireproxy"
tar -xzf "$archive" -C "$install_dir" wireproxy
chmod 755 "$install_dir/wireproxy"
