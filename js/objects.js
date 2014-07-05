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

    function feedbackDelayFactory(context, delayTime, feedback) {
        var delay = context.createDelayNode(delayTime + 1);
        FeedbackDelayNode.call(delay, context, delayTime, feedback);
        return delay;
    }

    AudioContext.prototype.createFeedbackDelay = function (delay, feedback) {
        return feedbackDelayFactory(this, delay, feedback);
    };
    /* simple feedback delay end */

    /* simple reverb start */
    function reverbFactory(context, seconds, options) {
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
        return reverbFactory(this, seconds, options);
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


var Synth = function (params) {
    "use strict";

    params = params || {};
    params = {
        mode: params.mode || 'poly',
        audio: params.audio || new AudioContext(),
        oscillators: params.oscillators || 4,
        lfos: params.lfos || 2,
        polyphony: params.polyphony || 6,
        waveTable: params.waveTable || {},
    };

    var synth = this,
        audio = params.audio,
        nodes = {
            mixer: audio.createChannelMerger(),
            filter: audio.createBiquadFilter(),
            volume: audio.createGain(),
            compressor: audio.createDynamicsCompressor(),
            delay: audio.createFeedbackDelay(0.4, 0.5),
            reverb: audio.createReverb(2),
            analyser: audio.createAnalyser()
        };


    synth.audio = params.audio;
    synth.nodes = nodes;
    synth.envelope = {
        attack: 0,
        decay: 0,
        sustain: 100,
        release: 0
    };

    synth.wTable = {
        'sine': null,
        'square': null,
        'sawtooth': null,
        'triangle': null,
        'white_noise': 'white_noise',
        'brown_noise': 'brown_noise',
        'pink_noise': 'pink_noise'
    };

    synth.osc = new Array(params.oscillators);
    synth.running_lfo = new Array(params.lfos);

    synth.initWaveTable = function () {
        var wave, waveTableName;
        for (waveTableName in params.waveTable) {
            wave = params.waveTable[waveTableName];
            synth.wTable[waveTableName] = audio.createPeriodicWave(new Float32Array(wave.real), new Float32Array(wave.imag));
        }
    };

    // public properties
    Object.defineProperties(synth, {
        'mode': {
            set: function (val) {
                params.mode = val;
            },
            get: function () {
                return params.mode;
            },
        },
        'oscillators': {
            set: function (val) {
                params.oscillators = val;
            },
            get: function () {
                return params.oscillators;
            },
        },
        'lfos': {
            set: function (val) {
                params.lfos = val;
            },
            get: function () {
                return params.lfos;
            },
        },
        'polyphony': {
            set: function (val) {
                params.polyphony = val;
            },
            get: function () {
                return params.polyphony;
            },
        },
        'waveTable': {
            set: function (val) {
                params.waveTable = val;
                synth.initWaveTable();
            },
            get: function () {
                return params.waveTable;
            }
        }
    });

    // public methods
    synth.play = function (freq) {
        var i = 0, l, o, lfo, retrig;

        for (l = 0; l < synth.running_lfo.length; l++) {
            if(!synth.isPlaying()) { synth.running_lfo[l].doRetrig() };
        }

        for (var i = 0; i < synth.osc.length; i++) {
            var o = synth.osc[i].play(freq);
            for (var l = 0; l < synth.running_lfo.length; l++) {
                var lfo = synth.running_lfo[l];
                if (synth.osc[i].enabled && lfo.enabled) {
                    if(lfo.parameter == 'osc_all_freq') { lfo.gain.connect(o.detune); }
                }
            }
        }
    };

    synth.stop = function (freq) {
        var osc = synth.osc,
            ct = audio.currentTime,
            release = parseFloat(synth.envelope.release),
            i;

        for (i = 0; i < synth.osc.length; i++) {
            //console.log("stopped: " + "[" + i + "]: " + freq);
            osc[i].stop(freq, ct + release * 8);
        }
    };

    synth.isPlaying = function () {
        var osc = synth.osc;

        for (i = 0; i < synth.osc.length; i++) {
            if(Object.keys(osc[i].voices).length > 0 || Object.keys(osc[i].releasingVoices).length > 0) {
                return true
            }
        }
        return false;
    }

    synth.updateWave = function (real, imag) {
        //console.info('updated Wave', new Float32Array(real), new Float32Array(imag));
        if (real && imag) synth.wTable.custom = audio.createPeriodicWave(new Float32Array(real), new Float32Array(imag));
        return true;
    };

    // sub-objects
    synth.Oscillator = function (params) {
        params = params || {};
        params = {
            enabled: params.enabled || 1,
            detune: params.enabled || 0,
            semitones: params.semitones || 0,
            volume: params.volume || 1,
            type: params.type || 'sawtooth',
            polyphony: params.polyphony || 6,
            parameter: params.parameter || 'none'
        };

        var oscillator = this,
            semitone = 100;

        oscillator.voices = {};
        oscillator.releasingVoices = {};
        oscillator.volumeGain = audio.createGain();

        // public properties
        Object.defineProperties(oscillator, {
            'enabled': {
                set: function (val) {
                    if (val) {
                        oscillator.volumeGain.connect(nodes.filter);
                    } else {
                        oscillator.volumeGain.disconnect();
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
                    oscillator.each(function (osc) {
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
                    oscillator.each(function (osc) {
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
                    oscillator.volumeGain.gain.value = val;
                    params.volume = val;
                },
                get: function () {
                    return params.volume;
                },
            },
            'parameter': {
                get: function () {
                    return params.parameter;
                },
                set: function (val) {
                    if (!oscillator.modParams[val]) throw "Invalid LFO parameter: " + val;
                    oscillator.gain.disconnect();
                    oscillator.gain.gain.value = parseFloat(oscillator.modParams[val].max_amount) * parseFloat(params.amount);

                    if (params.enabled) oscillator.modParams[val].assignParam(oscillator);
                    params.parameter = val;
                }
            },
            'type': {
                set: function (val) {
                    oscillator.each(function (osc) {
                        if (synth.wTable[val].match(/_noise$/)) {
                            // do nothing
                        } else
                        if (synth.wTable[val] === null) {
                            osc.type = val;
                        } else {
                            osc.setPeriodicWave(synth.wTable[val]);
                        }
                    });
                    params.type = val;
                },
                get: function () {
                    return params.type;
                },
            },
        });

        // public methods
        oscillator.each = function (callback) {
            for (var freq in oscillator.voices) {
                if(callback(oscillator.voices[freq]) === false) { break; }
            }
        };

        oscillator.play = function (freq) {
            //console.info('osc.play:', osc);
            var attack = parseFloat(synth.envelope.attack),
                decay = parseFloat(synth.envelope.decay),
                sustain = parseFloat(synth.envelope.sustain),
                ct = audio.currentTime,
                keyOsc = {},
                gate = audio.createGain(),
                match = params.type.match(/^([^_]+)_noise$/);
            if (!oscillator.enabled) return;
            if (oscillator.voices[freq]) return;
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
                keyOsc.setPeriodicWave = keyOsc.setPeriodicWave || keyOsc.setWaveTable; // safari compatibility

                keyOsc.frequency.value = freq;
                keyOsc.detune.value = parseInt(oscillator.detune) + (parseInt(semitone) * oscillator.semitones);
                if (synth.wTable[params.type] === null) {
                    keyOsc.type = params.type;
                } else {
                    keyOsc.setPeriodicWave(synth.wTable[params.type]);
                }
            }
            keyOsc.gate = gate;
            keyOsc.freq = freq;
            keyOsc.connect(keyOsc.gate);
            gate.connect(oscillator.volumeGain);

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
            oscillator.voices[freq] = keyOsc;
            return keyOsc;
        };

        oscillator.stop = function (freq, time) {
            var timeout = time || 0,
                ct = audio.currentTime,
                release = parseFloat(synth.envelope.release),
                sustain = parseFloat(synth.envelope.sustain),
                osc = oscillator.voices[freq];
            if (!osc) return;
            if (release > 0) {
                osc.gate.gain.cancelScheduledValues(ct);
                osc.gate.gain.setValueAtTime(osc.gate.gain.value, ct);
                osc.gate.gain.setTargetAtTime(0, ct, release);
                oscillator.releasingVoices[freq] = osc;
            }
            delete oscillator.voices[freq];

            osc.stop(time);
            osc.onended = function (e) {
                var o = e.target;
                for (var _freq in oscillator.releasingVoices) {
                    if (o === oscillator.releasingVoices[_freq]) delete oscillator.releasingVoices[_freq];
                    o.disconnect();
                }
            };
        };

        // constructor init
        if (params.enabled) {
            oscillator.volumeGain.connect(nodes.filter);
        }
    };

    synth.Lfo = function (params) {
        params = params || {};
        params = {
            enabled: params.enabled || 1,
            frequency: params.frequency || 5,
            amount: params.amount || 1,
            parameter: params.parameter || 'filter_freq',
            type: params.type || 'sine',
            retrig: params.retrig || 0
        };

        var lfo = this;

        // public properties
        Object.defineProperties(lfo, {
            'enabled': {
                get: function () {
                    return params.enabled;
                },
                set: function (val) {
                    if (val) {
                        lfo.modParams[params.parameter].assignParam(lfo);
                    } else {
                        lfo.gain.disconnect();
                    }
                    params.enabled = val;
                }
            },
            'frequency': {
                get: function () {
                    return params.frequency;
                },
                set: function (val) {
                    lfo.osc.frequency.value = parseFloat(val);
                    params.frequency = val;
                }
            },
            'amount': {
                get: function () {
                    return params.amount;
                },
                set: function (val) {
                    var modParam = lfo.modParams[params.parameter];
                    lfo.gain.gain.value = parseFloat(modParam.max_amount) * parseFloat(val);
                    params.amount = parseFloat(val);
                }
            },
            'parameter': {
                get: function () {
                    return params.parameter;
                },
                set: function (val) {
                    if (!lfo.modParams[val]) throw "Invalid LFO parameter: " + val;
                    lfo.gain.disconnect();
                    lfo.gain.gain.value = parseFloat(lfo.modParams[val].max_amount) * parseFloat(params.amount);

                    if (params.enabled) lfo.modParams[val].assignParam(lfo);
                    params.parameter = val;
                }
            },
            'type': {
                get: function () {
                    return params.type;
                },
                set: function (val) {
                    if (synth.wTable[val] === null) {
                        lfo.osc.type = val;
                    } else {
                        lfo.osc.setPeriodicWave(synth.wTable[val]);
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

        lfo.modParams = {
            filter_freq: {
                max_amount: 2000,
                assignParam: function (osc) {
                    osc.gain.connect(nodes.filter.frequency);
                }
            },
            osc_all_freq: {
                max_amount: 200,
                assignParam: function (osc, osc_target) {
                    if (osc_target) {
                        osc.gain.connect(osc_target.frequency);
                    }
                },
            },
            filter_reso: {
                max_amount: 40,
                assignParam: function (osc) {
                    osc.gain.connect(nodes.filter.Q);
                },
            },
            master_vol: {
                max_amount: 1,
                assignParam: function (osc) {
                    osc.gain.connect(nodes.volume.gain);
                },
            },
            delay_feedback: {
                max_amount: 1,
                assignParam: function (osc) {
                    osc.gain.connect(nodes.delay.gainNode.gain);
                },
            },
            delay_time: {
                max_amount: 1,
                assignParam: function (osc) {
                    osc.gain.connect(nodes.delay.delayTime);
                },
            },
            none: {
                max_amount: 0,
                assignParam: function (osc) {
                    osc.gain.disconnect();
                }
            },
        };

        // public methods
        lfo.doRetrig = function() {
            if (lfo.enabled && lfo.retrig) { createOsc() };
        };

        // private methods
        function createOsc() {
            if(lfo.osc) {
                lfo.osc.disconnect();
                lfo.osc.stop(0);
            }
            lfo.osc = audio.createOscillator();
            lfo.osc.setPeriodicWave = lfo.osc.setPeriodicWave || lfo.osc.setWaveTable; // safari compatibility

            lfo.osc.connect(lfo.gain);

            if (synth.wTable[params.type] === null) {
                lfo.osc.type = params.type;
            } else {
                lfo.osc.setPeriodicWave(synth.wTable[params.type]);
            }
            lfo.osc.frequency.value = params.frequency;
            lfo.parameter = params.parameter;
            lfo.osc.start(0);
        }

        // constructor init
        lfo.gain = audio.createGain();
        createOsc();
    };

    // constructor init
    synth.initWaveTable();
    console.info(synth.wTable);

    for(var i = 0; i < params.oscillators; i++) {
        synth.osc[i] = new this.Oscillator();
    }

    for(i = 0; i < params.lfos; i++) {
        synth.running_lfo[i] = new synth.Lfo();
    }

    nodes.filter.connect(nodes.delay);
    nodes.filter.connect(nodes.reverb);
    nodes.reverb.connect(nodes.compressor);
    nodes.delay.connect(nodes.compressor);
    nodes.compressor.connect(nodes.volume);
    nodes.volume.connect(nodes.analyser);
    nodes.analyser.connect(audio.destination);
};
