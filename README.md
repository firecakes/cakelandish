# Cakelandish
###### cake + outlandish
###### cake + lan + dish?

## What is this?
It's a powerful, self-hosting blogging server with minimal social features baked into RSS and written in Deno.

## Why did you make this?
- I'm tired of people and their data being reliant on social media corporations
- I'm tired of relying on Webpack
- More people should learn and use RSS
- I've yet to see an existing blogging platform/framework that caters to my wants
- I want to make the easiest server for non-programmers to host their own content with

## How can I learn this project?
[Check the GitHub wiki](https://github.com/firecakes/cakelandish/wiki) to get started and see screenshots of how the webpages look.

Or, if you want to see an example of this project running in the wild, check out my instance here: https://cakelandish.firecakesworld.com

My RSS feed is at `https://cakelandish.firecakesworld.com/feed.atom`.

NOTE: The minimum Deno version required is `v1.35.3`.

## Dev Commands

Auto format on save: 
`deno fmt --watch ./**/*.ts`

Auto run on save:
`deno run --allow-net --allow-read --allow-write=./ --allow-env --watch=./* --unstable main.ts`

Build:
`deno compile --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable main.ts`

`deno compile --target x86_64-unknown-linux-gnu --output Cakelandish-linux-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable main.ts`

`deno compile --target x86_64-pc-windows-msvc --output Cakelandish-windows-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable main.ts`

`deno compile --target x86_64-apple-darwin --output Cakelandish-mac-x86_64 --no-check --allow-net --allow-read --allow-write=./ --allow-env --unstable main.ts`

Create auth code:
`deno run --allow-net --allow-read=./ --allow-write=./ --allow-env main.ts code`
