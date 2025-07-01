export default {
  name: "switch-view-component-upload",
  props: {
    leftViewName: {
      type: String
    },
    rightViewName: {
      type: String
    },
    isAuthenticated: {
      type: Boolean
    },
    screen: {
      type: String
    },
    swapStartingView: {
      type: Boolean,
      required: false
    }
  },
  template: `
  <div v-if="screen !== 'lg' && isAuthenticated">
    <!-- switch view button (fixed version, to stay at top of screen while scrolling) -->
    <button class="switch-view-button-fixed text-large" @click="switchViews">{{ currentViewText }}</button>
    <!-- switch view button (relative version, so everything else gets pushed under the button still) -->
    <button tabindex="-1" class="switch-view-button text-large">{{ currentViewText }}</button>
  </div>
  <div class="flex">
    <div class="flex one-part" v-show="isAuthenticated === true && (screen === 'lg' || currentView === 'left')">
      <slot name="left-side"></slot>
    </div>
    <div class="flex one-part" v-show="isAuthenticated === true && (screen === 'lg' || currentView === 'right')">
      <slot name="right-side"></slot>
    </div>
  </div>
  `,
  data: function () {
    return {
      currentView: this.swapStartingView ? "right" : "left",
      currentViewText: this.swapStartingView ? this.leftViewName : this.rightViewName,
    };
  },
  mounted() {
  },
  methods: {
    switchViews () {
      if (this.currentView === "left") {
        this.currentView = "right";
        this.currentViewText = this.leftViewName
      } else if (this.currentView === "right") {
        this.currentView = "left";
        this.currentViewText = this.rightViewName
      }
    }
  },
};
