# Cakelandish Test Plan
## Environment Variables
- 
## 4xx.html
- Check that the appropriate image is loaded for each 4xx page
- Ensure that there is a "Return to main page" button and that the button actually takes you to the main page.
- Check that any invalid path taken on the browser takes you to the 404 page

## admin.html
- Test that clicking "Export Data" returns a link to download an exported.tar file. This file should contain the database.json, traffic.json, and the entirety of the /static folder.
- Check that "Import Data" lets you select an exported tar that then brings the state of Cakelandish back to that of the tar. Feeds and post data from the tar should be present on Cakelandish after the import.
- Check that Old Domain / New Domain text fields do proper string replacement across all post content and links in the database.
- Check that if traffic logs are enabled that time, page, and IP data are displayed in 20 aggregate intervals each.
- Check that the IP blacklist accepts a list of comma-separated strings that filter out IPs from all three aggregate data types. Check that adding a "-" in front of the IP blacklists it while adding a "+" in front of the IP whitelists it in search.
- Check that you can limit the viewing of traffic data by a date range
- Check that you can wipe out all traffic data with the "Delete Traffic History" button.
- Check that you can edit the list of banned IPv4s, including adding wildcards to a number in the address.

## index.html
- Check that the unauthenticated view shows a list of all posts created.
- Check that the authenticated view shows a command menu and feed list on the left, and the feed posts on the right.
- Each post should show the title, HTML rendered content, and a metadata sidebar with date of publication, category list, and a "Reply to post" button. Clicking on "Reply to post" takes you to upload.html with Reply feed URL and Reply Post ID URL prepopulated.
- Check that Cakelandish style replies to posts are also rendered on the feed, with a button to show the replied to post. If it is not renderable, show a link to the post instead.
- The "New Post" button should take you to upload.html.
- The "Manage Posts" button should take you to manage.html
- The "Manage Custom Pages and Files" button should take you to pages.html
- The "Edit Post Layout" button should take you to layout.html
- The "Admin Tools" button should take you to admin.html
- The sidebar should stay in the same place on the page even if the user is scrolling through the posts on the right
- For each feed, the favicon.ico image, the name of the feed, the eye symbol to focus on only that feed's contents, and an optional RSS archive download icon should be visible. Clicking on the focus symbol filters all feeds out except for the selected feed. Clicking it again should undo the filter.
- Clicking on "Add Feed" should bring up a "Name" "URL" and "Update Interval" field to add a new feed for. Clicking on an existing feed should bring up the same fields but prefilled to edit the feed.
- Each feed can be clicked on and either updated via "Save Edits" or removed via "Delete Feed".
- Each feed can be clicked and dragged to be reordered by releasing the click between two other feeds. All changes are persisted across page loads.
- "Search Posts" button should toggle showing a set of filter elements to add to restrict what is shown in the feed list. Category controls what tags are shown, Title searches for string matches in the post title, same with Content but with the post content, Date should filter based on a start and end range of dates, Has Image should filter out posts with any image or no images. "Invert filter" should work on every type of filter. There can be multiple filters added and there should be a list of active filters that can be removed.
- The currently running version of Cakelandish should show at the bottom of the sidebar, as well as how long data was last exported. CuRSSor shows how content he is with the user keeping maintenance up with these two processes.
- Check that adding a tag to the hidden tags list will cause a matching post's content to be hidden and show a "NSFW" warning
- Check that adding a tag to the blacklisted tags list will cause a post matching the tag to disappear
- If viewing the unauthenticated page, descriptions and media embeds should appear if OGP metadata was set appropriately per post.

## layout.html
- The layout file should be applied to every post made in Cakelandish. Various metadata and content can be injected into each post as follows:
- %%%content%%% - The content for the specific post. Really should be included.
- %%%published%%% - A string that is the date the post was originally created.
- %%%updated%%% - A string that is the date of the most recent changes.
- %%%categories%%% - A string that is a comma separated list of categories / tags.
- %%%title%%% - A string that is the title of this post.
- %%%localUrl%%% - A string that is the local URL of this post.
- %%%replyFeedUrl%%% - A string that is the URL of the feed this post replied to.
- %%%replyPostIdUrl%%% - A string that is the ID of the post inside the feed this post replied to.

## login.html
- If authenticated, the input field does not show and tells the user they are authenticated.
- If not authenticated, shows an input field that requires either a OTP code or a random string, generated running the Cakelandish code command. The OTP code only becomes consumable if the user enables authentication through the Cakelandish code command.

## manage.html
- Shows a list of every post made, with unrendered HTML. Each post can be edited or deleted, and the delete post button requires a confirmation click. Clicking "Edit post" takes the user to a populated upload.html page.
- The list of drafts appears above the list of published posts, which work very similarly to published posts.

## pages.html
- There should be a list of user uploaded folders and files under the static folder by default. Each file can be edited if it is an HTML, JS, CSS or TXT file. All files can be deleted, as well as directories, with a confirmation click.
- All directories, including the root directory, can have files uploaded to it and afterwards are viewable on this page.
- The URL Name field can be used to make new files, making new folders at the same time if "/" is used to represent child directories.
- Each directory can be expanded to reveal child files and child directories. This process is recursive.
- The critical files checkbox can be enabled to see more files that Cakelandish relies on to operate but hide from the user to prevent locking the server up on accident. The only locations that are truly uneditable are the generated folders "archive", "tmp" and "posts".

## upload.html
- HTML put on the left input box results in it being rendered on the right side, embedded inside the layout file. Anything a normal web page can do can be inserted into the left box. Additionally, the same text will be repeated into the RSS override box, unless it is toggled to separate the two, but the rendering of the content may be restricted by the RSS reader.
- Tags can be added, including looking up existing tags from the drop down, to categorize the type of post this is.
- Files of any kind can be uploaded to this post's directory. The following file types will automatically be rendered as images when uploaded:
- "apng", "avif", "gif", "jpeg", "jpg", "png", "svg", "webp", "bmp"
- The following file types will automatically be rendered as audio elements when uploaded:
- "wav", "ogg", "mp3"
- The following file types will automatically be rendered as video elements when uploaded:
- "webm", "mp4"
- All files uploaded also get added to the RSS input, unless RSS Override is toggled. In addition, all uploaded files will be remembered and displayed in a list for the user to embed into the HTML when clicked. These files can also be deleted from the post's directory.
- New posts from scratch have the option to be discarded, to be published immediately, or to be saved as a draft, which will appear in manage.html.
- Draft posts have the option to be published, saved again as a draft, or to not save changes.
- Published posts have the option to be updated, copied as a new draft, or to not save changes.
- If the post contains reply information in the reply fields, show the "Embed reply in post" button that when pressed, injects the content of the replied to post in the post.
- OGP Metadata can be set for the post, which includes webpage description text, and media in OGP metadata format which includes an alt text and an absolute URL to the media.
- OGP Metadata can be marked such that the user can choose which uploaded media will be rendered and in what order.

## feed.atom + /archive
- Every post made is added to feed.atom at the top of the file. All older posts get pushed down, and a maximum of 50 entries are stored in the main feed file by default.
- Every new post is marked with an index, starting from 0. These are how posts are counted, instead of counting all active posts. This means that a deleted published post will not affect how the archived feed files are generated, and the deleted post will still count toward the 50 post limit.
- Whenever a new post is made and 50 entries in feed.atom already exist, the oldest one is removed from feed.atom and stored in the archive folder as an archived feed file. The first archived feed file is marked as `feed-1.atom`, and successive archived feed files will be enumerated as `feed-#.atom` once another 50 posts fills up the previous archived feed file. Once a post is catalogued inside an archived feed file, its position and its location in the archive folder will never change, per specification requirements. The main feed.atom file will have backlinks to the archived feed files and the archived feed files will have forward links to the present so a program can scan through and read all posts ever made while preventing massive feed files from being rendered all at once.