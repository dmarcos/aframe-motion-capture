/* global AFRAME, THREE */
var log = AFRAME.utils.debug('aframe-motion-capture:motion-capture-recorder:info');

var EVENTS = {
  axismove: {id: 0, props: ['id', 'axis']},
  buttonchanged: {id: 1, props: ['id', 'state']},
  buttondown: {id: 2, props: ['id', 'state']},
  buttonup: {id: 3, props: ['id', 'state']},
  touchstart: {id: 4, props: ['id', 'state']},
  touchend: {id: 5, props: ['id', 'state']}
};

var EVENTS_DECODE = {
  0: 'axismove',
  1: 'buttonchanged',
  2: 'buttondown',
  3: 'buttonup',
  4: 'touchstart',
  5: 'touchend'
};

AFRAME.registerComponent('motion-capture-recorder', {
  schema: {
    autoRecord: {default: false},
    enabled: {default: true},
    hand: {default: 'right'},
    persistStroke: {default: false},
    visibleStroke: {default: true}
  },

  init: function () {
    this.drawing = false;
    this.recordedEvents = [];
    this.recordedPoses = [];
    this.addEventListeners();
  },

  addEventListeners: function () {
    var el = this.el;
    this.recordEvent = this.recordEvent.bind(this);
    el.addEventListener('axismove', this.recordEvent);
    el.addEventListener('buttonchanged', this.recordEvent);
    el.addEventListener('buttonup', this.recordEvent);
    el.addEventListener('buttondown', this.recordEvent);
    el.addEventListener('touchstart', this.recordEvent);
    el.addEventListener('touchend', this.recordEvent);

    // TODO: Introduce back in, but decoupled and configurable.
    // For hand-controlled recording, but not desired for avatar recording.
    // el.addEventListener('buttonchanged', this.onTriggerChanged.bind(this));
  },

  recordEvent: function (evt) {
    var detail;
    if (!this.isRecording) { return; }

    detail = {};
    EVENTS[evt.type].props.forEach(function buildDetail (propName) {
      detail[propName] = evt.detail[propName];
    });

    this.recordedEvents.push({
      name: evt.type,
      detail: detail,
      timestamp: this.lastTimestamp
    });
  },

  onTriggerChanged: function (evt) {
    var data = this.data;
    var value;
    if (!data.enabled || data.autoRecord) { return; }

    // Not trigger.
    if (evt.detail.id !== 1) { return; }

    value = evt.detail.state.value;
    if (value <= 0.1) {
      if (this.isRecording) { this.stopRecording(); }
      return;
    }
    if (!this.isRecording) { this.startRecording(); }
  },

  getJSONData: function () {
    if (!this.recordedPoses) { return; }
    return {
      poses: this.system.getStrokeJSON(this.recordedPoses),
      events: this.recordedEvents
    };
  },

  saveCapture: function (binary) {
    var jsonData = JSON.stringify(this.getJSONData());
    var type = binary ? 'application/octet-binary' : 'application/json';
    var blob = new Blob([jsonData], {type: type});
    var url = URL.createObjectURL(blob);
    var fileName = 'motion-capture-' + document.title + '-' + Date.now() + '.json';
    var aEl = document.createElement('a');
    aEl.setAttribute('class', 'motion-capture-download');
    aEl.href = url;
    aEl.setAttribute('download', fileName);
    aEl.innerHTML = 'downloading...';
    aEl.style.display = 'none';
    document.body.appendChild(aEl);
    setTimeout(function () {
      aEl.click();
      document.body.removeChild(aEl);
    }, 1);
  },

  update: function () {
    var el = this.el;
    var data = this.data;
    if (this.data.autoRecord) {
      this.startRecording();
    } else {
      // Don't try to record camera with controllers.
      if (el.components.camera) { return; }

      el.setAttribute('vive-controls', {hand: data.hand});
      el.setAttribute('oculus-touch-controls', {hand: data.hand});
      el.setAttribute('stroke', {hand: data.hand});
    }
  },

  tick: (function () {
    var position = new THREE.Vector3();
    var rotation = new THREE.Quaternion();
    var scale = new THREE.Vector3();

    return function (time, delta) {
      var newPoint;
      var pointerPosition;
      this.lastTimestamp = time;
      if (!this.data.enabled || !this.isRecording) { return; }
      newPoint = {
        position: this.el.getAttribute('position'),
        rotation: this.el.getAttribute('rotation'),
        timestamp: time
      };
      this.recordedPoses.push(newPoint);
      if (!this.data.visibleStroke) { return; }
      this.el.object3D.updateMatrixWorld();
      this.el.object3D.matrixWorld.decompose(position, rotation, scale);
      pointerPosition = this.getPointerPosition(position, rotation);
      this.el.components.stroke.drawPoint(position, rotation, time, pointerPosition);
    };
  })(),

  getPointerPosition: (function () {
    var pointerPosition = new THREE.Vector3();
    var offset = new THREE.Vector3(0, 0.7, 1);
    return function getPointerPosition (position, orientation) {
      var pointer = offset
        .clone()
        .applyQuaternion(orientation)
        .normalize()
        .multiplyScalar(-0.03);
      pointerPosition.copy(position).add(pointer);
      return pointerPosition;
    };
  })(),

  startRecording: function () {
    var el = this.el;
    if (this.isRecording) { return; }
    if (el.components.stroke) { el.components.stroke.reset(); }
    this.isRecording = true;
    this.recordedPoses = [];
    this.recordedEvents = [];
    el.emit('strokestarted', {entity: el, poses: this.recordedPoses});
  },

  stopRecording: function () {
    var el = this.el;
    if (!this.isRecording) { return; }
    log('Recorded ' + this.recordedPoses.length + ' poses.', el);
    el.emit('strokeended', {poses: this.recordedPoses});
    this.isRecording = false;
    if (!this.data.visibleStroke || this.data.persistStroke) { return; }
    el.components.stroke.reset();
  }
});
