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
  <div v-if="!page.isImportant || showImportantFiles">
    <div class="post">
      <div class="third form"><a :href="page.url">{{ page.url }}</a></div>
      <div class="third form">
        <button v-if="page.editable" class="button" @click="editPage(page)">{{ page.directory ? (expandedDirectory ? "Collapse directory" : "Expand directory") : "Edit file" }}</button>
      </div>
      <div v-if="!page.requestDeletion" class="third form"><button class="button" @click="deletePage(page)">Delete {{ page.directory ? "directory" : "file" }}</button></div>
      <div v-if="page.requestDeletion" class="third form"><button class="button" @click="deletePage(page)">Are you sure?</button></div>
      <div v-if="page.directory" class="third form">
        <label tabindex="0" role="button" @keydown.enter="$refs['uploadFile' + key].click()" :for="'file-upload-' + page.url" class="form file-upload button">
          <p class="flex-center">Upload file here</p>
        </label>
        <input :ref="'uploadFile' + key" :id="'file-upload-' + page.url" accept="image/*" class="hidden" type="file" @change="uploadFile($event, page)" multiple/>
      </div>
      <div v-else class="third form"></div>
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
