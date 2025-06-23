export default {
  name: "static-file",
  props: {
    page: {
      url: String,
      content: String,
      directory: Object,
      isImportant: Boolean,
      extension: String,
      requestDeletion: Boolean,
      editable: Boolean,
    },
    showImportantFiles: Boolean,
  },
  template: `
  <div v-if="!page.isImportant || showImportantFiles" class="top-space">
    <div class="flex bg-light one-part">
      <div class="flex-center two-part"><a class="text-medium" :href="page.url">{{ page.url }}</a></div>
      <div class="flex one-part">
        <button v-if="page.editable" class="button text-medium one-part side-space" @click="editPage(page)">{{ page.directory ? (expandedDirectory ? "Collapse directory" : "Expand directory") : "Edit file" }}</button>
      </div>
      <div v-if="!page.requestDeletion" class="flex one-part"><button class="button text-medium one-part side-space" @click="deletePage(page)">Delete {{ page.directory ? "directory" : "file" }}</button></div>
      <div v-if="page.requestDeletion" class="flex one-part"><button class="button text-medium one-part side-space" @click="deletePage(page)">Are you sure?</button></div>
      <div v-if="page.directory" class="flex one-part">
        <label tabindex="0" role="button" @keydown.enter="$refs['uploadFile' + page.url].click()" :for="'file-upload-' + page.url" class="button text-medium one-part side-space">
          Upload file here
        </label>
        <input :ref="'uploadFile' + page.url" :id="'file-upload-' + page.url" accept="*" class="hidden" type="file" @change="uploadFile($event, page)" multiple/>
      </div>
      <div v-else class="flex one-part"></div>
    </div>
    <static-file
      style="margin-left: 20px;"
      :key="innerPage.url"
      :page="innerPage"
      @edit-page="editPage"
      @delete-page="deletePage"
      @upload-file="uploadFile"
      :show-important-files="showImportantFiles"
      v-if="expandedDirectory"
      v-for="innerPage in page.directory">
    </static-file>
  </div>`,
  data: function () {
    return {
      expandedDirectory: false
    };
  },
  mounted() {
  },
  methods: {
    editPage(page) {
      if (page.directory) {
        this.expandedDirectory = !this.expandedDirectory;
      } else {
        // is a regular file. edit page open
        this.$emit("edit-page", page);
      }
    },
    deletePage(page) {
      this.$emit("delete-page", page);
    },
    uploadFile(event, page) {
      this.$emit("upload-file", event, page);
    }
  },
};
