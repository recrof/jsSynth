/* global window,AudioContext,Float32Array */
/*
 *   This Software is licenced under GNU GPLv3
 *   http://www.gnu.org/licenses/gpl-3.0.html
 *
 *   original url: http://dualsoul.net/tmp/jsSynth/
 *
 */

// compatibility stuff
window.AudioContext = window.AudioContext || window.webkitAudioContext;
AudioContext.prototype.createPeriodicWave = AudioContext.prototype.createPeriodicWave || AudioContext.prototype.createWaveTable;
AudioContext.prototype.createGainNode = AudioContext.prototype.createGainNode || AudioContext.prototype.createGain;
AudioContext.prototype.createDelayNode = AudioContext.prototype.createDelayNode || AudioContext.prototype.createDelay;

(function (AudioContext) {
    "use strict";
    /* simple feedback delay start */
    function FeedbackDelayNode(context, delay, feedback) {
        this.delayTime.value = delay;
        this.gainNode = context.createGainNode();
        this.gainNode.gain.value = feedback;
        this.connect(this.gainNode);
        this.gainNode.connect(this);
    }

    function FeedbackDelayFactory(context, delayTime, feedback) {
        var delay = context.createDelayNode(delayTime + 1);
        FeedbackDelayNode.call(delay, context, delayTime, feedback);
        return delay;
    }

    AudioContext.prototype.createFeedbackDelay = function (delay, feedback) {
        return FeedbackDelayFactory(this, delay, feedback);
    };
    /* simple feedback delay end */

    /* simple reverb start */
    function ReverbFactory(context, seconds, options) {
        options = options || {};
        var sampleRate = context.sampleRate;
        var length = sampleRate * seconds;
        var impulse = context.createBuffer(2, length, sampleRate);
        var impulseL = impulse.getChannelData(0);
        var impulseR = impulse.getChannelData(1);
        var decay = options.decay || 2;
        for (var i = 0; i < length; i++) {
            var n = options.reverse ? length - i : i;
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
        }
        var convolver = context.createConvolver();
        convolver.buffer = impulse;
        return convolver;
    }

    AudioContext.prototype.createReverb = function (seconds, options) {
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

var Synth = function (jsSynthWaveTable) {
    "use strict";
    var self = this,
        audio = new AudioContext(),
        nodes = {
            mixer: audio.createChannelMerger(),
            filter: audio.createBiquadFilter(),
            volume: audio.createGain(),
            compressor: audio.createDynamicsCompressor(),
            delay: audio.createFeedbackDelay(0.4, 0.5),
            reverb: audio.createReverb(2),
            analyser: audio.createAnalyser()
        };
    this.audio = audio;
    this.nodes = nodes;
    this.polyphony = 6;

    this.play = function (freq) {
        for (var i = 0; i < this.osc.length; i++) {
            var o = this.osc[i].play(freq);
            for (var l = 0; l < this.running_lfo.length; l++) {
                var lfo = this.running_lfo[l];
                if (this.osc[i].enabled && lfo.enabled) {
                    if(lfo.retrig) { lfo.doRetrig() }
                    if(lfo.parameter == 'osc_freq') { lfo.gain.connect(o.detune) };
                }
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
        startParams = startParams || {};
        var semitone = 100,
            params = {
            enabled: startParams.enabled || 1,
            detune: startParams.enabled || 0,
            semitones: startParams.semitones || 0,
            volume: startParams.volume || 1,
            type: startParams.type || 'sawtooth',
            polyphony: startParams.polyphony || 6,
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
                match = params.type.match(/^([^_]+)_noise$/);
                //automation = _self.volumeGain.auto.points;
            if (!_self.enabled) return;
            //keyOsc.connect(gate);
            if (_self.voices[freq]) return;
            if (match) {
                if (match[1] == 'pink') {
                    keyOsc = audio.createPinkNoise();
                } else if (match[1] == 'brown') {
                    keyOsc = audio.createBrownNoise();
                } else if (match[1] == 'white') {
                    keyOsc = audio.createWhiteNoise();
                }
            }
            else {
                keyOsc = audio.createOscillator();
                keyOsc.frequency.value = freq;
                keyOsc.detune.value = parseInt(_self.detune) + (parseInt(semitone) * _self.semitones);
                if (self.waveTable[params.type] === null) {
                    keyOsc.type = params.type;
                } else {
                    keyOsc.setPeriodicWave = keyOsc.setPeriodicWave || keyOsc.setWaveTable;
                    keyOsc.setPeriodicWave(self.waveTable[params.type]);
                }
            }
            keyOsc.gate = gate;
            keyOsc.freq = freq;
            keyOsc.connect(keyOsc.gate);
            gate.connect(_self.volumeGain);
            /*
            if(_self.auto_enabled) {
                for(var i = 0; i < automation.length; i++) {
                    var time = automation[i].x,
                        value = automation[i].y;
                    _self.volumeGain.gain.linearRampToValueAtTime(value, ct+time);
                }
            //keyOsc.gate.gain.cancelScheduledValues(ct);
            }
            */
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
        startParams = startParams || {};
        var params = {
            enabled: startParams.enabled || 1,
            frequency: startParams.frequency || 5,
            amount: startParams.amount || 1,
            parameter: startParams.parameter || 'filter_freq',
            type: startParams.type || 'sine',
            retrig: startParams.retrig || 0,
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
                    _self.gain.disconnect();
                    _self.gain.gain.value = parseFloat(_self.modParams[val].max_amount) * parseFloat(params.amount);

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

        this.modParams = {
            filter_freq: {
                max_amount: 2000,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.filter.frequency);
                }
            },
            osc_freq: {
                max_amount: 200,
                assignParam: function (lfo, osc) {
                    if (osc) {
                        lfo.gain.connect(osc.frequency);
                    }
                },
            },
            filter_reso: {
                max_amount: 40,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.filter.Q);
                },
            },
            master_vol: {
                max_amount: 1,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.volume.gain);
                },
            },
            delay_feedback: {
                max_amount: 1,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.delay.gainNode.gain);
                },
            },
            delay_time: {
                max_amount: 1,
                assignParam: function (lfo) {
                    lfo.gain.connect(nodes.delay.delayTime);
                },
            },
            none: {
                max_amount: 0,
                assignParam: function (lfo) {
                    lfo.gain.disconnect();
                }
            },
        };

        this.doRetrig = function() {
            createOsc();
        };

        function createOsc() {
            if(_self.osc) {
                _self.osc.disconnect();
                _self.osc.stop(0);
            }
            _self.osc = audio.createOscillator();
            _self.osc.connect(_self.gain);

            if (self.waveTable[params.type] === null) {
                _self.osc.type = params.type;
            } else {
                _self.osc.setPeriodicWave(self.waveTable[params.type]);
            }
            _self.osc.frequency.value = params.frequency;
            _self.parameter = params.parameter;
            _self.osc.start(0);
        }

        this.gain = audio.createGain();
        createOsc();
    };

    this.updateWave = function (real, imag) {
        //console.info('updated Wave', new Float32Array(real), new Float32Array(imag));
        if (real && imag) self.waveTable.custom = audio.createPeriodicWave(new Float32Array(real), new Float32Array(imag));
        return true;
    };

    this.envelope = {
        attack: 0,
        decay: 0,
        sustain: 100,
        release: 0
    };

    this.osc = [];
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
