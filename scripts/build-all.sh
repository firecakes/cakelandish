#!/bin/bash

deno compile --target x86_64-unknown-linux-gnu --output out/cakelandish-linux-x86_64 --unstable-kv --no-check --allow-net --allow-read --allow-write=./ --allow-env main.ts

deno compile --target x86_64-pc-windows-msvc --output out/cakelandish-windows-x86_64 --unstable-kv --no-check --allow-net --allow-read --allow-write=./ --allow-env main.ts

deno compile --target x86_64-apple-darwin --output out/outcakelandish-mac-x86_64 --unstable-kv --no-check --allow-net --allow-read --allow-write=./ --allow-env main.ts
