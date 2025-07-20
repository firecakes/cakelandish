# Cakelandish

###### cake + outlandish

###### cake + lan + dish?

## What is this?

It's a powerful, self-hosted blogging server with RSS reading + writing support and written in Deno.

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

NOTE: The minimum Deno version required is `v2.1.2`.

## Community + Support

There is now an official forum for discussing this project and for developing personal websites in general. All registrations will be manually approved to help prevent bots. [Register here!](https://forums.cakelandish.com)

I also now accept donations for development and upkeep on the forum and on this project. If you wish to contribute financially, [you may do so here](https://ko-fi.com/firecakes). Thank you!

## Compiling

Compile for current OS:

`deno task compile`

Compile for Windows, MacOS, Linux platforms:

`deno task compile-all`

All compiled binaries are outputted to the `out` directory

## Dev Commands

Auto format on save: `deno task auto-format`

Auto run on save: `deno task dev`

Create auth code: `deno task code`
