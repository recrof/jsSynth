/* global Synth, navigator,window,Storage,$,localStorage,console,AudioContext,Uint8Array,Float32Array,requestAnimationFrame,jsSynthWaveTable,prompt,document,QwertyHancock,AutoUI,confirm */

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

var s = {};

$(function () {
    var synth = new Synth({waveTable: jsSynthWaveTable}),
        nodes = synth.nodes,
        audio = synth.audio,
        presets,i,l,
        framedrop = 10,
        framecounter = 0,
        keypressed = {},
        timeByteData = new Uint8Array(nodes.analyser.fftSize),
        freqByteData = new Uint8Array(nodes.analyser.frequencyBinCount),
        canvas = $('#scope')[0],
        scope = canvas.getContext('2d'),
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
        }),
        autoDiv = $('<div>', {
            id: 'autoDiv',
            class: 'panel_auto'
        }),
        autoUI = new AutoUI({
            id: 'autoUI',
            parent: autoDiv,
        });

    function animateCanvas() {
        var sampling_divider = 0.5,
            totalValue = 0,
            freqDivider = 2.55;

        requestAnimationFrame(animateCanvas, canvas);
        if ((++framecounter % framedrop) !== 0) {
            return;
        }
        framecounter = 0;

        nodes.analyser.getByteFrequencyData(freqByteData);

        for (var i = 0; i < freqByteData.length; i+= 16) {
            totalValue += freqByteData[i];
        }
        if(totalValue === 0) { return; } // if freqency byte data are all zero, don't draw

        nodes.analyser.getByteTimeDomainData(timeByteData);
        scope.clearRect(0, 0, canvas.width, canvas.height);

        scope.lineWidth = 0.3;

        scope.beginPath();
        scope.moveTo(0, canvas.height / 2);
        scope.lineTo(canvas.width, canvas.height / 2);
        scope.strokeStyle = '#333';
        scope.stroke();

        scope.lineWidth = 0.3;

        scope.beginPath();

        scope.moveTo(0, freqByteData[0]);
        for (var x = 0; x/freqDivider < canvas.width; x++) {
            scope.lineTo(x/freqDivider, canvas.height - freqByteData[x] / 2);
        }
        scope.strokeStyle = '#aa0000';
        scope.stroke();
        scope.lineWidth = 0.7;

        scope.beginPath();
        scope.moveTo(0, timeByteData[0]+22);
        for (x = 0; x < canvas.width; x += sampling_divider) {

            scope.lineTo(x, timeByteData[x]+22);
            //scope.fillRect(x, timeByteData[x * sampling_divider], 1, 1);
        }
        scope.strokeStyle = '#00aa00';
        scope.stroke();
    }

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
        //console.info(id,value);
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
            if (key.match(/preset/)) return;
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
                    if ($(this).text() == value) {
                        $(this).attr('selected', 'selected');
                    }
                });
            } else {
                $(this).val(value);
            }
        });
    }

    function importPreset() {
        var text = window.prompt("Please paste your preset: ", '');
        var index = $('#preset_table option').length - 1;
        try {
            JSON.parse(text);
            localStorage.setItem('preset' + index, text);
        } catch (err) {
            window.alert('Preset is invalid, please try again');
        }
    }

    function exportPreset(index) {
        var text = localStorage.getItem('preset' + index);
        window.prompt("Exported preset.. copy to clipboard and share: ", text);
    }

    function loadPreset(index) {
        var preset = localStorage.getObject('preset' + index);
        for (var key in preset) {
            updateKnob(key, preset[key]);
            knobChanged(key, preset[key]);
        }
        return preset;
    }

    function loadFactoryPresets() {
        if (presets) {
            for (var i = 0; i < presets.length; i++) {
                localStorage.setObject('preset' + i, presets[i]);
            }
        }

    }

    function updatePresets(selected) {
        var preset, i = 0;
        $('#preset_table').empty();
        while ((preset = localStorage.getObject('preset' + i))) {
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
        } else if ((arr = id.match(/^(detune|semitones|volume|type|enabled|auto_enabled)([\d]+)$/))) {
            param = arr[1];
            i = arr[2];
            synth.osc[i][param] = value;
        } else if ((arr = id.match(/^lfo_(enabled|retrig|parameter|frequency|type|amount)([\d]+)$/))) {
            param = arr[1];
            i = arr[2];
            //console.info('lfo', i, param, value);
            if(!synth.running_lfo[i]) return;
            synth.running_lfo[i][param] = value;
        } else if ((arr = id.match(/^delay_(delay|feedback|enabled)$/))) {
            param = arr[1];

            if (param == 'enabled') {
                if (value) {
                    nodes.filter.connect(nodes.delay);
                } else {
                    nodes.filter.disconnect();
                    nodes.filter.connect(nodes.compressor);
                    //nodes..connect(nodes.compressor);
                }
            } else if (param == 'delay') {
                nodes.delay.delayTime.value = value;
            } else if (param == 'feedback') {
                nodes.delay.gainNode.gain.value = value;
            }
        } else if ((arr = id.match(/^reverb_(enabled|level)$/))) {
            param = arr[1];

            if (param == 'enabled') {
                if (value) {
                    nodes.reverb.connect(nodes.compressor);
                } else {
                    nodes.reverb.disconnect();
                    //nodes..connect(nodes.compressor);
                }
            } else if (param == 'level') {
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

    synth.osc[0].detune = 1;
    synth.osc[0].semitones = 7;
    synth.osc[0].volume = 0.7;
    synth.osc[0].type = 'analog_saw';

    synth.osc[1].detune = 0;
    synth.osc[1].semitones = 0;
    synth.osc[1].volume = 0.7;
    synth.osc[1].type = 'analog_saw';

    synth.osc[2].detune = 0;
    synth.osc[2].semitones = -12;
    synth.osc[2].volume = 1;
    synth.osc[2].type = 'triangle';

    synth.osc[3].detune = 0;
    synth.osc[3].semitones = 19;
    synth.osc[3].volume = 0.7;
    synth.osc[3].type = 'analog_saw';

    s = synth;
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

    if (!navigator.userAgent.match(/(Chrome|Safari|Opera)\//)) {
        $("<div>",{
            class: 'info_banner',
            html: "<img src='http://i.imgur.com/B9VxWPA.png' /> I'm using cutting-edge features of WebKit, there is high chance this won't work on Other browser engines :("
        }).appendTo($('body'));
    }

    showOscilatorParameters(synth.osc, synth.wTable);

    autoDiv.appendTo($('body'));

    synth.running_lfo.forEach(function(lfo, l) {
        $('#lfo_parameter' + l).each(function () {
            for (var param in lfo.modParams) {
                //console.info('adding lfo parameter', param);
                $(this).append($('<option>', {
                    text: param
                }));
            }
        });
    });

    for (var type in synth.waveTable) {
        if(type.match(/_noise$/)) continue;
        for (l = 0; l < synth.running_lfo.length; l++) {
            $('#lfo_type' + l).append($('<option>', {
                text: type
            }));
        }
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
    }).on('change input', function (e) {
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
/*
    $('#update_wave').on('click', function () {
        var real = [],
            imag = [];
        for (var i = 0; i < 4096; i++) {
            real[i] = 0;
            imag[i] = 0;
        }

        if (!eval($('#custom_wave').val())) return;
        console.info(real, imag);
        synth.updateWave(real, imag);
        synth.osc[0].type = 'custom';
    });
*/
    $('#preset_load').on('click', function () {
        var index = $('#preset_table').val();
        if (isNaN(index)) return;
        loadPreset(index);
    });

    $(window).on('click', function(e) {
        var id = $(e.target).attr('id');
        if(!id || !id.match(/^(auto_|autoDiv|autoUI)/)) { autoDiv.hide(); }
    }).on('keydown',function(e) {
        if(e.keyCode == 27) {
            autoDiv.hide();
        }
    });

    $('input[type=number]').each(function () {
        var idName = ($(this).attr('id')).replace('label_', ''),
            attrs = ['min', 'max', 'step'];
            $('<button>',{
                html: 'a',
                id: 'auto_' + idName,
                //style: 'display: none'
            })
            .on('click', function(e) {
                var display = autoDiv.css('display') == 'block' ? 'none' : 'block';
                if(autoDiv.attr('data-param') != $(this).attr('id')) { display = 'block'; }
                autoDiv.css({
                    'top': e.pageY+5,
                    'left': e.pageX+5,
                    'display': display
                });
                autoDiv.attr('data-param',$(this).attr('id'));
            })
            .insertBefore($(this));

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
        updatePresets(index);
    });

    $('#preset_export').on('click', function () {
        var index = $('#preset_table').val();
        exportPreset(index);
    });

    $('#preset_import').on('click', function () {
        importPreset();
        updatePresets();
    });
    //console.info(nodes.analyser.fftSize);

    loadFactoryPresets();
    updatePresets();
    animateCanvas();
});


