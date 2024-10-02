import * as util from "../util.js";

export default {
  name: "feed-post",
  props: {
    post: Object,
    index: Number,
  },
  template: `
  <div>
    <!-- main content -->
    <div class="post-left">
      <div class="center span">
        <span class="post-title">{{ post.entry.title }}</span>
      </div>
      <a class="center link-id" :href="post.entry.id">{{ post.entry.id }}</a>

      <button 
        v-if="post.entry.nsfw"
        class="button load-reply-button" 
        @click="post.entry.nsfw = false">
        Post marked as NSFW. Click here to show it.
      </button>

      <!-- summary text is included as a tooltip when hovering over the content -->
      <span 
        v-html="post.entry.content"
        v-if="!post.entry.nsfw"
        :title="post.entry.summary">
      </span>
      <br>
      <div class="reply-div">
        <!-- We are looking for two links with rel="related" properties -->
        <button 
          v-if="post.entry.links.length >= 2 && !post.entry.hideReplyToButton" 
          class="button load-reply-button" 
          @click="loadReplyTo(post.entry)">
            Load Original Post
        </button>
        <button
          v-if="post.entry.noSource"
          class="button load-reply-button"
          @click="loadReplyTo(post.entry)">
          Source Not Found. Click to Retry
        </button>
        <a v-if="post.entry.noSource" :href="post.entry.originalLink">Original link: {{ post.entry.originalLink }} </a>
        <div class="content-end"></div>
      </div>
    </div>
    <!-- vertical line break -->
    <div class="vr"></div>
    <!-- metadata -->
    <div class="post-right">
      <span class="center span">{{ post.meta.title }}</span>
      <span v-if="post.meta.subtitle" class="center span meta-subtitle">{{ post.meta.subtitle }}</span>
      <p v-if="post.meta.author" class="center meta-author">{{ post.meta.author }}</p>
      <p class="center link-id">{{ post.meta.id }}</p>
      <div class="center category" v-for="category in post.entry.categories">
        #{{ category }}
      </div>
      <!-- date at the bottom -->
      <div class="date">
        <p class="center time-ago">{{ new Date(post.entry.date).toLocaleString() }} ({{ new Date(post.entry.date).toString().match(/\\\([A-z\\\s]+\\\)/)[0].match(/[A-z\\\s]+/)[0].split(' ').map(s => s[0]).join('')  }})</p>
        <p class="center time-ago">{{ computeRelativeTime(post.entry.date) }}</p>
      </div>
      <button class="button reply-button" @click="startReply(post)">Reply to post</button>
    </div>
  </div>`,
  data: function () {
    return {};
  },
  mounted() {
  },
  methods: {
    computeRelativeTime(date) {
      let ms = Date.now() - new Date(date);
      let seconds = Math.floor(ms / 1000);
      // use a higher denomination if the lower denomination exceeds (higher denomination * 3) time
      if (seconds < 60 * 3) {
        return `${seconds} seconds ago`;
      }
      let minutes = Math.floor(seconds / 60);
      if (minutes < 60 * 3) {
        return `${minutes} minutes ago`;
      }
      let hours = Math.floor(seconds / (60 * 60));
      if (hours < 24 * 3) {
        return `${hours} hours ago`;
      }
      let days = Math.floor(seconds / (60 * 60 * 24));
      if (days < 7 * 3) {
        return `${days} days ago`;
      }
      let weeks = Math.floor(seconds / (60 * 60 * 24 * 7));
      if (weeks < 4 * 3) {
        return `${weeks} weeks ago`;
      }
      let months = Math.floor(seconds / (60 * 60 * 24 * 30));
      if (months < 12 * 3) {
        return `${months} months ago`;
      }
      let years = Math.floor(seconds / (60 * 60 * 24 * 365));
      return `${years} years ago`;
    },
    startReply(post) {
      window.location.href =
        `/upload.html?feedurl=${post.meta.feedLink}&id=${post.entry.id}`;
    },
    async loadReplyTo(entry) {
      // disable the Load Original button immediately
      this.post.entry.hideReplyToButton = true;
      entry.noSource = false;

      const {parsedFeed, originalLink} = await util.extractFeedLinks(entry);

      // both must exist before attempting to create the replied from post
      if (parsedFeed === null || originalLink === null) {
        // failed to render the reply. inform the user
        // if true, shows the button that says the source couldn't be failed
        entry.noSource = true;
        // show the original link found to have some way to find the source of the post
        entry.originalLink = originalLink;
        return;
      }

      // find the ID defined by the url of the original post and render its contents
      const originalPost = await util.findTargetPost(parsedFeed, originalLink);
      if (originalPost === null) {
        // failed to render the reply. inform the user
        // if true, shows the button that says the source couldn't be failed
        entry.noSource = true;
        // show the original link found to have some way to find the source of the post
        entry.originalLink = originalLink;
        return;
      }

      // specify that this is a replied to post so it can be rendered differently
      originalPost.entry.isRepliedTo = true;
      this.$emit("renderReplyTo", originalPost, this.index);
    },
  },
};
