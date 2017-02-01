/* global THREE, AFRAME  */
var log = AFRAME.utils.debug('aframe-motion-capture:avatar-recorder:info');
var warn = AFRAME.utils.debug('aframe-motion-capture:avatar-recorder:warn');

var LOCALSTORAGE_KEY = 'avatar-recording';

AFRAME.registerComponent('avatar-recorder', {
  schema: {
    autoRecord: {default: false},
    autoPlay: {default: true},
    autoPlayDelay: {default: 500},
    localStorage: {default: true},
    binaryFormat: {default: false}
  },

  init: function () {
    var self = this;
    var el = this.el;
    this.trackedControllerEls = {};
    this.onKeyDown = this.onKeyDown.bind(this);
    this.tick = AFRAME.utils.throttle(this.throttledTick, 100, this);

    // Grab camera.
    if (el.camera && el.camera.el) {
      prepareCamera(el.camera.el);
    } else {
      el.addEventListener('camera-set-active', function (evt) {
        prepareCamera(evt.detail.cameraEl);
      });
    }

    function prepareCamera (cameraEl) {
      self.cameraEl = cameraEl;
      self.cameraEl.setAttribute('motion-capture-recorder', {
        autoRecord: false,
        visibleStroke: false
      });
    }
  },

  /**
   * Replay recording immediately after recording.
   * Differs from `autoPlayRecording` in that it uses recorded `this.recordingData` and
   * overrides any recording sources that `avatar-replayer` may have defined.
   */
  replayRecording: function () {
    var sceneEl = this.el;
    log('Replaying recording just taken.');
    sceneEl.setAttribute('avatar-replayer', {autoPlay: false});
    sceneEl.components['avatar-replayer'].startReplaying(this.recordingData);
  },

  /**
   * Replay recording on initialization as `autoPlay`.
   * Differs from `replayRecording` in that this lets `avatar-replayer` decide where to
   * source its recording.
   */
  autoReplayRecording: function () {
    var data = this.data;
    var sceneEl = this.el;

    if (!data.autoPlay) { return; }

    // Add timeout to let the scene load a bit before replaying.
    setTimeout(function () {
      sceneEl.setAttribute('avatar-replayer', {autoPlay: true});
    }, data.autoPlayDelay);
  },

  /**
   * Tell `avatar-replayer` to stop recording.
   */
  stopReplaying: function () {
    var avatarPlayer = this.el.components['avatar-replayer'];
    if (!avatarPlayer) { return; }
    log('Stopped replaying.');
    avatarPlayer.stopReplaying();
  },

  /**
   * Poll for tracked controllers.
   */
  throttledTick: function () {
    var self = this;
    var trackedControllerEls = this.el.querySelectorAll('[tracked-controls]');
    trackedControllerEls.forEach(function (trackedControllerEl) {
      if (!trackedControllerEl.id) {
        warn('Found tracked controllers with no id. It will not be recorded');
        return;
      }
      if (self.trackedControllerEls[trackedControllerEl.id]) { return; }
      trackedControllerEl.setAttribute('motion-capture-recorder', {
        autoRecord: false,
        visibleStroke: false
      });
      self.trackedControllerEls[trackedControllerEl.id] = trackedControllerEl;
      if (this.isRecording) {
        trackedControllerEl.components['motion-capture-recorder'].startRecording();
      }
    });
  },

  play: function () {
    window.addEventListener('keydown', this.onKeyDown);
    this.autoReplayRecording();
  },

  pause: function () {
    window.removeEventListener('keydown', this.onKeyDown);
  },

  /**
   * Keyboard shortcuts.
   * space: toggle recording.
   * p: toggle replaying.
   * c: clear local storage.
   * ctrl/shift/s: save recording to file.
   */
  onKeyDown: function (evt) {
    var key = evt.keyCode;
    var replayer = this.el.components['avatar-replayer'];

    // space.
    if (key === 32) {
      this.toggleRecording();
      return;
    }

    // p.
    if (key === 80) {
      this.toggleReplaying();
      return;
    }

    // c.
    if (key === 67) {
      log('Recording cleared from localStorage.');
      this.recordingData = null;
      localStorage.removeItem(LOCALSTORAGE_KEY);
      return;
    }

    // ctrl/shift/s.
    if (evt.ctrlKey && evt.shiftKey && key === 83) {
      if (replayer && replayer.replayData) {
        this.saveRecordingFile(replayer.replayData);
      } else {
        this.saveRecordingFile(this.getJSONData());
      }
    }
  },

  toggleReplaying: function () {
    var avatarPlayer = this.el.components['avatar-replayer'];
    if (!avatarPlayer) {
      this.el.setAttribute('avatar-replayer', '');
      avatarPlayer = this.el.components['avatar-replayer'];
    }

    if (avatarPlayer.isReplaying) {
      this.stopReplaying();
    } else {
      this.replayRecording();
    }
  },

  toggleRecording: function () {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  startRecording: function () {
    var trackedControllerEls = this.trackedControllerEls;
    var keys = Object.keys(trackedControllerEls);
    if (this.isRecording) { return; }
    log('Starting recording!');
    this.stopReplaying();
    this.isRecording = true;
    this.cameraEl.components['motion-capture-recorder'].startRecording();
    keys.forEach(function (id) {
      trackedControllerEls[id].components['motion-capture-recorder'].startRecording();
    });
  },

  stopRecording: function () {
    var trackedControllerEls = this.trackedControllerEls;
    var keys = Object.keys(trackedControllerEls);
    if (!this.isRecording) { return; }
    log('Stopped recording.');
    this.isRecording = false;
    this.cameraEl.components['motion-capture-recorder'].stopRecording();
    keys.forEach(function (id) {
      trackedControllerEls[id].components['motion-capture-recorder'].stopRecording();
    });
    this.saveRecording();
    if (this.data.autoPlay) { this.replayRecording(); }
  },

  getJSONData: function () {
    var data = {};
    var trackedControllerEls = this.trackedControllerEls;
    var keys = Object.keys(trackedControllerEls);
    if (this.isRecording) { return; }
    this.isRecording = false;
    data.camera = this.cameraEl.components['motion-capture-recorder'].getJSONData();
    keys.forEach(function (id) {
      data[id] = trackedControllerEls[id].components['motion-capture-recorder'].getJSONData();
    });
    this.recordingData = data;
    return data;
  },

  saveRecording: function () {
    var data = this.getJSONData()
    if (this.data.localStorage) {
      log('Recording saved to localStorage.');
      this.saveToLocalStorage(data);
    } else {
      log('Recording saved to file.');
      this.saveRecordingFile(data);
    }
  },

  saveToLocalStorage: function (data) {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
  },

  saveRecordingFile: function (data) {
    var jsonData = JSON.stringify(data);
    var type = this.data.binaryFormat ? 'application/octet-binary' : 'application/json';
    var blob = new Blob([jsonData], {type: type});
    var url = URL.createObjectURL(blob);
    var fileName = 'recording-' + document.title.toLowerCase() + '.json';
    var aEl = document.createElement('a');
    aEl.href = url;
    aEl.setAttribute('download', fileName);
    aEl.innerHTML = 'downloading...';
    aEl.style.display = 'none';
    document.body.appendChild(aEl);
    setTimeout(function () {
      aEl.click();
      document.body.removeChild(aEl);
    }, 1);
  }
});
