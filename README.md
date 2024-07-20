# Cakelandish

###### cake + outlandish

###### cake + lan + dish?

## What is this?

It's a powerful, self-hosting blogging server with minimal social features baked
into RSS and written in Deno.

## Why did you make this?

- I'm tired of people and their data being reliant on social media corporations
- I'm tired of relying on Webpack
- More people should learn and use RSS
- I've yet to see an existing blogging platform/framework that caters to my
  wants
- I want to make the easiest server for non-programmers to host their own
  content with

## How can I learn this project?

[Check the GitHub wiki](https://github.com/firecakes/cakelandish/wiki) to get
started and see screenshots of how the webpages look.

Or, if you want to see an example of this project running in the wild, check out
my instance here: https://cakelandish.firecakesworld.com

My RSS feed is at `https://cakelandish.firecakesworld.com/feed.atom`.

NOTE: The minimum Deno version recommended is `v1.41.0`.

## Compiling

Compile for current os:

`deno compile --no-check --allow-net --allow-read --allow-write=./ --allow-env main.ts`

Compile for linux:

`deno compile --target x86_64-unknown-linux-gnu --output out/cakelandish-linux-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable-kv main.ts`

Compile for windows:

`deno compile --target x86_64-pc-windows-msvc --output out/cakelandish-windows-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable-kv main.ts`

Compile for macos:

`deno compile --target x86_64-apple-darwin --output out/cakelandish-mac-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable-kv main.ts`

A build all script is also included in the [scripts directory](scripts/)

All compiled binaries are outputted to the [out directory](out/)

## Dev Commands

Auto format on save: `deno task auto-format`

Auto run on save: `deno task dev`

Create auth code: `deno task code`
