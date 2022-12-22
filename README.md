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

Mobile devices not supported yet. Stay tuned.

## Dev Commands

Auto format on save: 
`deno fmt --watch ./**/*.ts`

Auto run on save:
`deno run --allow-net --allow-read --allow-write=./ --watch=./* main.ts`

Build:
`deno compile --no-check --allow-net --allow-read --allow-write=./ main.ts`

`deno compile --target x86_64-unknown-linux-gnu --no-check --allow-net --allow-read --allow-write=./ main.ts`

`deno compile --target x86_64-pc-windows-msvc --no-check --allow-net --allow-read --allow-write=./ main.ts`

`deno compile --target x86_64-apple-darwin --no-check --allow-net --allow-read --allow-write=./ main.ts`

Create auth code:
`deno run --allow-net --allow-read=./ --allow-write=./ main.ts code`
