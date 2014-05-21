/* global window,Storage,$,localStorage,console,AudioContext,Uint8Array,Float32Array,requestAnimationFrame,jsSynthWaveTable,prompt,document,QwertyHancock,confirm */

/*
 *
 *   Synth.js v0.2
 *   Copyright 2014, forcer
 *
 *   Contact:
 *   recrof /at/ gmail.com
 *       or
 *   forcer /at/ vnet.sk
 *
 *   This Software is licenced under GNU GPLv3
 *   http://www.gnu.org/licenses/gpl-3.0.html
 *
 *   original url: http://dualsoul.net/tmp/jsSynth/
 *
 */

if(!navigator.userAgent.match(/Chrome\//)) { alert("Sorry guys, I'm using cutting-edge features of Chrome, there is high chance this won't work on Other browsers :(") }

window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

Storage.prototype.setObject = function (key, value) {
    "use strict";
    this.setItem(key, JSON.stringify(value));
};

Storage.prototype.getObject = function (key) {
    "use strict";
    var value = this.getItem(key);
    return value && JSON.parse(value);
};

window.AudioContext = window.AudioContext || window.webkitAudioContext;

(function (AudioContext) {
    "use strict";

    /* simple feedback delay start */
    function FeedbackDelayNode(context, delay, feedback){
        this.delayTime.value = delay;
        this.gainNode = context.createGainNode();
        this.gainNode.gain.value = feedback;
        this.connect(this.gainNode);
        this.gainNode.connect(this);
    }

    function FeedbackDelayFactory(context, delayTime, feedback){
        var delay = context.createDelayNode(delayTime + 1);
        FeedbackDelayNode.call(delay, context, delayTime, feedback);
        return delay;
    }

    AudioContext.prototype.createFeedbackDelay = function(delay, feedback){
        return FeedbackDelayFactory(this, delay, feedback);
    };
    /* simple feedback delay end */

    /* simple reverb start */
    function ReverbFactory(context, seconds, options){
        options = options || {};
        var sampleRate = context.sampleRate;
        var length = sampleRate * seconds;
        var impulse = context.createBuffer(2, length, sampleRate);
        var impulseL = impulse.getChannelData(0);
        var impulseR = impulse.getChannelData(1);
        var decay = options.decay || 2;
        for (var i = 0; i < length; i++){
          var n = options.reverse ? length - i : i;
          impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
          impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        }
        var convolver = context.createConvolver();
        convolver.buffer = impulse;
        return convolver;
    }

    AudioContext.prototype.createReverb = function(seconds, options){
        return ReverbFactory(this, seconds, options);
    };
    /* simple reverb end */

    AudioContext.prototype.createWhiteNoise = function (bufferSize) {
        bufferSize = bufferSize || 2 * this.sampleRate;
        var buffer = this.createBuffer(1, bufferSize, this.sampleRate),
            output = buffer.getChannelData(0),
            node = this.createBufferSource();

        for (var i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        node.buffer = buffer;
        node.loop = true;
        return node;
    };

    AudioContext.prototype.createPinkNoise = function (bufferSize) {
        bufferSize = bufferSize || 2 * this.sampleRate;
        var b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;

        var buffer = this.createBuffer(1, bufferSize, this.sampleRate),
            output = buffer.getChannelData(0),
            node = this.createBufferSource();

        for (var i = 0; i < bufferSize; i++) {
            var white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11; // (roughly) compensate for gain
            b6 = white * 0.115926;
        }
        node.buffer = buffer;
        node.loop = true;

        return node;
    };

    AudioContext.prototype.createBrownNoise = function (bufferSize) {
        bufferSize = bufferSize || 2 * this.sampleRate;
        var lastOut = 0.0;
        var buffer = this.createBuffer(1, bufferSize, this.sampleRate),
            output = buffer.getChannelData(0),
            node = this.createBufferSource();

        for (var i = 0; i < bufferSize; i++) {
            var white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; // (roughly) compensate for gain
        }
        node.buffer = buffer;
        node.loop = true;

        return node;
    };
})(window.AudioContext);


var audio = new AudioContext(),
    synth,
    nodes = {},
    canvas,
    scope,
    framedrop = 10,
    framecounter = 0,
    octave = 1,
    keyboard = {},
    keypressed = {};

function getKnobValue(what) {
    var value;
    var id = what.attr('id');
    if (what.attr('type') == 'checkbox') {
        value = what.prop('checked') ? 1 : 0;
    } else
    if (what[0].tagName == 'select') {
        value = what.$('option:selected').text();
    } else {
        value = what.val();
    }
    return value;
}

function savePreset(index, name) {
    var preset = {};
    console.info(name);
    if (!name) name = prompt("Name of the preset", "Noname" + index);
    if (name === null) return;
    $('input[type=range],input[type=checkbox],select').each(function () {
        var key = $(this).attr('id'),
            value = getKnobValue($(this));
        preset[key] = value;
    });
    preset.preset_name = name;
    localStorage.setObject('preset' + index, preset);
}


function updateKnob(id, value) {
    $('#' + id).each(function () {
        if ($(this).attr('type') == 'checkbox') {
            $(this).prop('checked', (value == 1));
        } else
        if ($(this)[0].tagName == 'select') {
            $('option', this).each(function () {
                if ($(this).text() == value) { $(this).attr('selected', 'selected'); }
            });
        } else {
            $(this).val(value);
        }
    });
}

function loadPreset(index) {
    var preset = localStorage.getObject('preset' + index);
    for (var key in preset) {
        updateKnob(key, preset[key]);
        knobChanged(key, preset[key]);
    }
    return preset;
}

function updatePresets(selected) {
    var preset, i = 0;
    $('#preset_table').empty();
    while (preset = localStorage.getObject('preset' + i)) {
        $('#preset_table').append($('<option>', {
            text: preset.preset_name,
            value: i
        }));
        i++;
    }
    $('#preset_table').append($('<option>', {
        text: '[New Preset]',
        value: i
    }));
    if (!isNaN(selected)) $('#preset_table').val(selected);
}

function knobChanged(id, value) {
    var arr, param, i;
    if (id == 'volume') {
        nodes.volume.gain.value = value;
    } else if (id == 'cutoff') {
        nodes.filter.frequency.value = value * value;
    } else if (id == 'Q') {
        nodes.filter.Q.value = value;
    } else if (id.match(/^(attack|decay|sustain|release)$/)) {
        synth.envelope[id] = value;
    } else if (arr = id.match(/^(detune|semitones|volume|type|enabled)([\d]+)$/)) {
        param = arr[1];
        i = arr[2];
        synth.osc[i][param] = value;
    } else if (arr = id.match(/^lfo_(enabled|parameter|frequency|type|amount)([\d]+)$/)) {
        param = arr[1];
        i = arr[2];
        //console.info('lfo', i, param, value);
        synth.running_lfo[i][param] = value;
    }
    else if (arr = id.match(/^delay_(delay|feedback|enabled)$/)) {
        param = arr[1];

        if (param == 'enabled') {
            if(value) {
                nodes.filter.connect(nodes.delay);
            } else {
                nodes.filter.disconnect();
                nodes.filter.connect(nodes.compressor);
                //nodes..connect(nodes.compressor);
            }
        } else if(param == 'delay') {
            nodes.delay.delayTime.value = value;
        } else if(param == 'feedback') {
            nodes.delay.gainNode.gain.value = value;
        }
    }
    else if (arr = id.match(/^reverb_(enabled|level)$/)) {
        param = arr[1];

        if (param == 'enabled') {
            if(value) {
                nodes.reverb.connect(nodes.compressor);
            } else {
                nodes.reverb.disconnect();
                //nodes..connect(nodes.compressor);
            }
        } else if(param == 'level') {
            //nodes.delay.delayTime.value = value;
        }
    }
    //console.info('[', id, ']:', value);
    $('#label_' + id).val(value);
}

function showOscilatorParameters(osc, waveTable) {
    var oscGroup = $('#oscillators');
    //console.info(osc[0].semitones);
    for (var i = 0; i < osc.length; i++) {
        $.tmpl($('#SynthControlsTemplate').html(), {
            id: i
        }).appendTo('#oscillators');
        for (var type in waveTable) {
            $('#type' + i).append($('<option>', {
                text: type
            }));
        }
        var params = ['detune', 'enabled', 'semitones', 'volume', 'type'];
        for (var n = 0; n < params.length; n++) {
            var val = osc[i][params[n]];
            //console.info(i, params[n], val);
            $('#' + params[n] + i).val(osc[i][params[n]]);
        }
    }
}

function apreggio(freq, mode) {

}

$(function () {
    synth = new Synth();
    scope = document.querySelector('.scope').getContext('2d');
    canvas = document.querySelector('.scope');
    //scope.translate(0.5, 0.5);
    animateCanvas();
    //console.info(nodes.analyser.fftSize);
    showOscilatorParameters(synth.osc, synth.waveTable);
    for(var l = 0; l < synth.running_lfo.length; l++) {
        $('#lfo_parameter'+l).each(function () {
            var lfo = synth.running_lfo[l];
            for (var param in lfo.modParams) {
            //console.info('adding lfo parameter', param);
                $(this).append($('<option>', {
                    text: param
                }));
            }
        });
    }
    for (var type in synth.waveTable) {
        for(var l = 0; l < synth.running_lfo.length; l++) {
            $('#lfo_type'+l).append($('<option>', {
                text: type
            }));
        };
    }
    $('input[type=checkbox],select').each(function () {
        knobChanged($(this).attr('id'), getKnobValue($(this)));
    }).on('change', function (e) {
        var value = getKnobValue($(this));
        knobChanged($(this).attr('id'), value);
    });
    $('input[type=range]').each(function () {
        $(this).attr('step', $(this).attr('step') || 1);
        knobChanged($(this).attr('id'), $(this).val());
    }).on('change', function (e) {
        knobChanged($(this).attr('id'), $(this).val());
    }).on('mousewheel DOMMouseScroll', function (e) {
        var o = e.originalEvent;
        var delta = o && (o.wheelDelta || (o.detail && -o.detail));

        if (delta) {
            e.preventDefault();
            var step = parseFloat($(this).attr('step'));
            var value = parseFloat($(this).val());
            step *= delta < 0 ? 1 : -1;
            $(this).val(value + step);
            knobChanged($(this).attr('id'), $(this).val());
        }
    });

    $('#total_stop').on('click', function () {
        /*
        for (var freq in synth.playingKeys) {
            //synth.playingKeys[freq];
            for (var i in synth.playingKeys[freq]) {
                synth.playingKeys[freq][i].disconnect();
            }
            synth.playingKeys[freq] = [];
            synth.playingKeys.releasing = [];
        }
*/
    });
    $('#update_wave').on('click', function () {
        var real = [],
            imag = [];
        for(var i=0;i<4096;i++) {
            real[i] = 0;
            imag[i] = 0;
        }

        if(!eval($('#custom_wave').val())) return;
        console.info(real,imag);
        synth.updateWave(real,imag);
        synth.osc[0].type = 'custom';
    });

    $('#preset_load').on('click', function () {
        var index = $('#preset_table').val();
        if (isNaN(index)) return;
        loadPreset(index);
    });

    $('input[type=number]').each(function () {
        var idName = ($(this).attr('id')).replace('label_', ''),
            attrs = ['min', 'max', 'step'];
        for (var i = 0; i < attrs.length; i++) {
            $(this).attr(attrs[i], $('#' + idName).attr(attrs[i]));
        }
    }).on('change', function () {
        var val = $(this).val(),
            idName = ($(this).attr('id')).replace('label_', '');
        if (isNaN(val)) {
            val = 0;
            $(this).val(0);
        }
        $('#' + idName).val(val);
        knobChanged(idName, val);
    });

    $('#preset_save').on('click', function () {
        var index = $('#preset_table').val(),
            name = $("#preset_table option:selected").text();
        console.info('saving', index, name);
        if (isNaN(index)) return;
        if (name != '[New Preset]') {
            if (confirm('Are you sure to overwrite "' + name + '" ?')) savePreset(index, name);
            else return;
        }

        savePreset(index);
        updatePresets(index);
    });
    keyboard = new QwertyHancock({
        id: 'keyboard',
        width: 1000,
        height: 200,
        octaves: 3,
        startNote: 'C2',
        whiteNotesColour: 'white',
        blackNotesColour: 'black',
        hoverColour: '#f3e939',
        keyboardLayout: 'en'
    });
    keyboard.keyDown = function (note, freq) {
        if (keypressed[note]) return;
        //console.info('start on ' + ch + ' called: ' + s.keyboard[ch]);
        synth.play(freq);
        keypressed[note] = 1;
    };

    keyboard.keyUp = function (note, freq) {
        //console.info('stop on ' + ch + ' called: ' + s.keyboard[ch]);
        synth.stop(freq);
        keypressed[note] = 0;
    };

    savePreset(0, 'default');
    updatePresets();
});

nodes.mixer = audio.createChannelMerger();
nodes.analyser = audio.createAnalyser();
nodes.filter = audio.createBiquadFilter();
nodes.volume = audio.createGain();
nodes.compressor = audio.createDynamicsCompressor();

nodes.delay = audio.createFeedbackDelay(0.4,0.5);
nodes.reverb = audio.createReverb(2);
//nodes.feedbackGain = audio.createGain ? audio.createGain() : audio.createGainNode();
nodes.analyser.smoothingTimeConstant = 0.5;
nodes.analyser.fftSize = 512;

var Synth = function () {
    "use strict";
    var self = this;
    this.polyphony = 6;

    this.play = function (freq) {
        for (var i = 0; i < this.osc.length; i++) {
            var o = this.osc[i].play(freq);
            for(var l = 0; l < this.running_lfo.length; l++) {
                var lfo = this.running_lfo[l];
                if(lfo.enabled && lfo.parameter == 'osc_freq') lfo.gain.connect(o.detune);
            }
        }
    };

    this.stop = function (freq) {
        var osc = this.osc,
            ct = audio.currentTime,
            release = parseFloat(this.envelope.release);

        for (var i = 0; i < this.osc.length; i++) {
            //console.log("stopped: " + "[" + i + "]: " + freq);
            osc[i].stop(freq, ct + release * 8);
        }
    };

    this.Oscillator = function (startParams) {
        var semitone = 100;
        var params = {
            enabled: 1,
            detune: 0,
            semitones: 0,
            volume: 1,
            type: 'sawtooth',
            polyphony: 6,
        };

        var _self = this;

        Object.defineProperties(this, {
            'enabled': {
                set: function (val) {
                    if (val == params.enabled) return;
                    if (val) {
                        _self.volumeGain.connect(nodes.filter);
                    } else {
                        _self.volumeGain.disconnect();
                    }
                    params.enabled = val;
                },
                get: function () {
                    return params.enabled;
                },

            },
            'detune': {
                set: function (val) {
                    val = parseFloat(val);
                    if (val == params.detune) return;
                    _self.each(function (osc) {
                        osc.detune.value = val + semitone * params.semitones;
                    });
                    params.detune = val;
                },
                get: function () {
                    return params.detune;
                },

            },
            'semitones': {
                set: function (val) {
                    val = parseFloat(val);
                    if (val == params.semitones) return;
                    _self.each(function (osc) {
                        osc.detune.value = params.detune + semitone * val;
                    });
                    params.semitones = val;
                },
                get: function () {
                    return params.semitones;
                },

            },
            'volume': {
                set: function (val) {
                    val = parseFloat(val);
                    if (val == params.volume) return;
                    _self.volumeGain.gain.value = val;
                    params.volume = val;
                },
                get: function () {
                    return params.volume;
                },
            },
            'type': {
                set: function (val) {
                    //if (val == params.type) return;
                    _self.each(function (osc) {
                        if (self.waveTable[val].match(/_noise$/)) {
                            // do nothing
                        } else
                        if (self.waveTable[val] === null) {
                            osc.type = val;
                        } else {
                            osc.setPeriodicWave(self.waveTable[val]);
                        }
                    });
                    params.type = val;
                },
                get: function () {
                    return params.type;
                },
            },
        });

        this.voices = {};
        this.releasingVoices = {};

        this.each = function (callback) {
            for (var freq in _self.voices) {
                callback(_self.voices[freq]);
            }
        };

        this.play = function (freq) {
            //console.info('osc.play:', osc);
            var attack = parseFloat(self.envelope.attack),
                decay = parseFloat(self.envelope.decay),
                sustain = parseFloat(self.envelope.sustain),
                ct = audio.currentTime,
                keyOsc,
                gate = audio.createGain(),
                match;
            if (!_self.enabled) return;
            //keyOsc.connect(gate);
            if (_self.voices[freq]) return;

            if (match = params.type.match(/^([^_]+)_noise$/)) {
                if(match[1] == 'pink') { keyOsc = audio.createPinkNoise(); }
                else if (match[1] == 'brown') { keyOsc = audio.createBrownNoise(); }
                else if (match[1] == 'white') { keyOsc = audio.createWhiteNoise(); }
            } else {

                keyOsc = audio.createOscillator();
                keyOsc.frequency.value = freq;
                keyOsc.detune.value = parseInt(_self.detune) + (parseInt(semitone) * _self.semitones);
                if (self.waveTable[params.type] === null) {
                    keyOsc.type = params.type;
                } else {
                    keyOsc.setPeriodicWave(self.waveTable[params.type]);
                }
            }
            keyOsc.gate = gate;
            keyOsc.freq = freq;
            keyOsc.connect(keyOsc.gate);
            gate.connect(_self.volumeGain);


            //keyOsc.gate.gain.cancelScheduledValues(ct);

            if (attack > 0) {
                keyOsc.gate.gain.setValueAtTime(0, ct);
                keyOsc.gate.gain.linearRampToValueAtTime(1, ct + attack);

            } else {
                keyOsc.gate.gain.setValueAtTime(1, ct);
            }
            if (decay > 0) {
                keyOsc.gate.gain.setTargetAtTime(sustain / 5, ct + attack, decay);
            }
            keyOsc.start(0);
            _self.voices[freq] = keyOsc;
            return keyOsc;
        };

        this.stop = function (freq, time) {
            var timeout = time || 0,
                ct = audio.currentTime,
                release = parseFloat(self.envelope.release),
                sustain = parseFloat(self.envelope.sustain),
                osc = _self.voices[freq];
            if (!osc) return;
            if (release > 0) {
                osc.gate.gain.cancelScheduledValues(ct);
                osc.gate.gain.setValueAtTime(osc.gate.gain.value, ct);
                osc.gate.gain.setTargetAtTime(0, ct, release);
                _self.releasingVoices[freq] = osc;
            }
            delete _self.voices[freq];

            osc.stop(time);
            osc.onended = function (e) {
                var o = e.target;
                for (var _freq in _self.releasingVoices) {
                    if (o === _self.releasingVoices[_freq]) delete _self.releasingVoices[_freq];
                    o.disconnect();
                }
            };
        };

        for (var paramName in params) {
            if (startParams) params[paramName] = startParams[paramName] === undefined ? params[paramName] : startParams[paramName];
            _self[paramName] = params[paramName];
        }

        this.volumeGain = audio.createGain();
        if (params.enabled) {
            _self.volumeGain.connect(nodes.filter);
        }
    };

    this.waveTable = {
        'sine': null,
        'square': null,
        'sawtooth': null,
        'triangle': null,
        'white_noise': 'white_noise',
        'brown_noise': 'brown_noise',
        'pink_noise': 'pink_noise'
    };

    this.initWaveTable = function () {
        for (var waveTableName in jsSynthWaveTable) {
            var wave = jsSynthWaveTable[waveTableName];
            this.waveTable[waveTableName] = audio.createPeriodicWave(new Float32Array(wave.real), new Float32Array(wave.imag));
        }
    };

    this.lfo = function (startParams) {
        var params = {
            enabled: 1,
            frequency: 5,
            amount: 1,
            parameter: 'filter_freq',
            type: 'sine',
            retrig: 0,
        };

        var _self = this;

        Object.defineProperties(this, {
            'enabled': {
                get: function () {
                    return params.enabled;
                },
                set: function (val) {
                    if (val == params.enabled) return;
                    if (val) {
                        _self.modParams[params.parameter].assignParam(_self);
                    } else {
                        _self.gain.disconnect();
                    }
                    params.enabled = val;
                }
            },
            'frequency': {
                get: function () {
                    return params.frequency;
                },
                set: function (val) {
                    _self.osc.frequency.value = parseFloat(val);
                    params.frequency = val;
                }
            },
            'amount': {
                get: function () {
                    return params.amount;
                },
                set: function (val) {
                    var modParam = _self.modParams[params.parameter];
                    _self.gain.gain.value = parseFloat(modParam.max_amount) * parseFloat(val);
                    params.amount = parseFloat(val);
                }
            },
            'parameter': {
                get: function () {
                    return params.parameter;
                },
                set: function (val) {
                    if (!_self.modParams[val]) throw "Invalid LFO parameter: " + val;
                    if (params.enabled) _self.modParams[val].assignParam(_self);
                    params.parameter = val;
                }
            },
            'type': {
                get: function () {
                    return params.type;
                },
                set: function (val) {
                    if (self.waveTable[val] === null) {
                        _self.osc.type = val;
                    } else {
                        _self.osc.setPeriodicWave(self.waveTable[val]);
                    }
                    params.type = val;
                }
            },
            'retrig': {
                get: function () {
                    return params.retrig;
                },
                set: function (val) {
                    params.retrig = val;
                }
            }

        });

        this.osc = audio.createOscillator();
        this.gain = audio.createGain();
        this.osc.connect(this.gain);

        if (self.waveTable[params.type] === null) {
            this.osc.type = params.type;
        } else {
            this.osc.setPeriodicWave(self.waveTable[params.type]);
        }

        this.osc.start(0);

        this.modParams = {
            filter_freq: {
                max_amount: 2000,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.filter.frequency);
                }
            },
            osc_freq: {
                max_amount: 2000,
                assignParam: function (lfo, osc) {
                    if (osc) {
                        lfo.gain.connect(osc.frequency);
                    }
                },
            },
            none: {
                max_amount: 0,
                assignParam: function (lfo) {
                    lfo.gain.disconnect();
                }
            },
        };

        for (var paramName in params) {
            if (startParams) params[paramName] = startParams[paramName] === undefined ? params[paramName] : startParams[paramName];
            _self[paramName] = params[paramName];
        }
    };

    this.updateWave = function (real,imag) {

        //console.info('updated Wave', new Float32Array(real), new Float32Array(imag));
        if(real && imag) self.waveTable.custom = audio.createPeriodicWave(new Float32Array(real), new Float32Array(imag));
        return true;
    };

    this.envelope = {
        attack: 0,
        decay: 0,
        sustain: 100,
        release: 0
    };

    this.osc = [];
    this.presets = [];
    this.running_lfo = [];
    this.initWaveTable();
    this.updateWave();

    this.osc.push(new this.Oscillator({
            enabled: 1,
            detune: 1,
            semitones: 7,
            volume: 0.7,
            type: 'sawtooth',
            polyphony: this.polyphony
        }),
        new this.Oscillator({
            enabled: 0,
            detune: 0,
            semitones: 0,
            volume: 0.7,
            type: 'sawtooth',
            polyphony: this.polyphony
        }),
        new this.Oscillator({
            enabled: 0,
            detune: -2,
            semitones: -12,
            volume: 1,
            type: 'triangle',
            polyphony: this.polyphony

        }),
        new this.Oscillator({
            enabled: 0,
            detune: 0,
            semitones: 19,
            volume: 0.7,
            type: 'sawtooth',
            polyphony: this.polyphony
        })
    );

    //nodes.filter.connect(nodes.compressor);
    nodes.filter.connect(nodes.delay);

    nodes.filter.connect(nodes.reverb);
    nodes.reverb.connect(nodes.compressor);
    nodes.delay.connect(nodes.compressor);

    nodes.compressor.connect(nodes.volume);
    nodes.volume.connect(nodes.analyser);
    nodes.analyser.connect(audio.destination);
    this.running_lfo.push(new this.lfo(), new this.lfo());

};

function animateCanvas() {
    requestAnimationFrame(animateCanvas, canvas);
    if ((++framecounter % framedrop) !== 0) {
        return;
    }
    framecounter = 0;

    scope.clearRect(0, 0, canvas.width, canvas.height);
    var timeByteData = new Uint8Array(nodes.analyser.fftSize);
    nodes.analyser.getByteTimeDomainData(timeByteData);
    var freqByteData = new Uint8Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getByteFrequencyData(freqByteData);

    var sampling_divider = 0.5;
    scope.lineWidth = 0.5;

    scope.beginPath();
    scope.moveTo(0, freqByteData[0]);
    for (var x = 0; x < canvas.width; x++) {
        scope.lineTo(x, canvas.height / 1.2 - freqByteData[x] / 2);
    }
    scope.strokeStyle = '#aa0000';
    scope.stroke();

    scope.beginPath();
    scope.moveTo(0, timeByteData[0]);
    for (x = 0; x < canvas.width; x += sampling_divider) {

        scope.lineTo(x, timeByteData[x]);
        //scope.fillRect(x, timeByteData[x * sampling_divider], 1, 1);
    }
    scope.strokeStyle = '#00aa00';
    scope.stroke();
}
